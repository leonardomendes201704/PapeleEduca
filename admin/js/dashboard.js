import { supabase } from './supabase-client.js';
import { STORAGE_BUCKET } from './config.js';
import { showBusyOverlay, hideBusyOverlay, showResultModal } from './admin-feedback.js';
import {
  MATERIALS_TREE,
  formatCategoryLabel,
  getSubcategories,
  hasSubcategories,
} from '../../js/materiais-taxonomy.js';

const form = document.getElementById('product-form');
const modal = document.getElementById('product-modal');
const statusEl = document.getElementById('form-status');
const listEl = document.getElementById('products-list');
const newBtn = document.getElementById('product-new-btn');
const cancelBtn = document.getElementById('product-cancel-btn');
const closeBtn = document.getElementById('product-modal-close');
const formTitle = document.getElementById('form-title');
const previewEl = document.getElementById('image-preview');
const totalEl = document.getElementById('count-total');
const publishedEl = document.getElementById('count-published');
const draftEl = document.getElementById('count-draft');
const socialForm = document.getElementById('social-links-form');
const socialStatusEl = document.getElementById('social-status');
const metricsEmailForm = document.getElementById('metrics-email-form');
const metricsEmailStatusEl = document.getElementById('metrics-email-status');
const metricsEmailMetaEl = document.getElementById('metrics-email-meta');
const metricsEmailStateLabelEl = document.getElementById('metrics-email-state-label');
const metricsEmailSendNowBtn = document.getElementById('metrics-email-send-now');

const fields = {
  id: document.getElementById('product-id'),
  existingImages: document.getElementById('existing-images'),
  title: document.getElementById('title'),
  category: document.getElementById('category'),
  subcategory: document.getElementById('subcategory'),
  hotmartUrl: document.getElementById('hotmart-url'),
  description: document.getElementById('description'),
  price: document.getElementById('price'),
  promoPrice: document.getElementById('promo-price'),
  promoStart: document.getElementById('promo-start'),
  promoEnd: document.getElementById('promo-end'),
  status: document.getElementById('status'),
  featured: document.getElementById('featured'),
  images: document.getElementById('images'),
  instagramUrl: document.getElementById('instagram-url'),
  facebookUrl: document.getElementById('facebook-url'),
  metricsEmailEnabled: document.getElementById('metrics-email-enabled'),
  metricsEmailTime: document.getElementById('metrics-email-time'),
  metricsEmailRecipients: document.getElementById('metrics-email-recipients'),
};

const STATUS_LABELS = {
  published: 'Publicado',
  draft: 'Rascunho',
  archived: 'Arquivado',
};

let currentProducts = [];
let productMetricsById = {};
let currentImages = [];
let pendingFiles = [];
let productsBound = false;
let settingsBound = false;
let metricsEmailBound = false;
let facebookModalProduct = null;
let facebookDeleteModalProduct = null;

const currency = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

function $(id) {
  return document.getElementById(id);
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  })[char]);
}

function productPublicUrl(productId) {
  const origin = window.location.origin || 'https://papele-educa.vercel.app';
  return `${origin.replace(/\/$/, '')}/produto/${encodeURIComponent(productId)}`;
}

function productFacebookShareUrl(product) {
  const url = new URL(productPublicUrl(product.id));
  url.searchParams.set('utm_source', 'facebook');
  url.searchParams.set('utm_medium', 'social');
  url.searchParams.set('utm_campaign', 'product');
  url.searchParams.set('utm_content', String(product.slug || product.id || ''));
  return url.toString();
}

function defaultProductFacebookMessage(product) {
  const title = String(product?.title || '').trim();
  const description = String(product?.description || '').trim().replace(/\s+/g, ' ').slice(0, 280);
  if (description) return `${title}\n\n${description}`;
  return title;
}

function slugify(text) {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function buildInternalSlug(title) {
  const base = slugify(title) || 'produto';
  const suffix = Date.now().toString(36);
  return `${base}-${suffix}`;
}

function openProductModal(product = null) {
  if (!modal) return;
  if (product) {
    editProduct(product);
  } else {
    resetForm();
  }
  modal.showModal();
}

function closeProductModal() {
  if (!modal) return;
  modal.close();
}

function populateCategorySelect() {
  if (!fields.category) return;
  const current = fields.category.value;
  fields.category.innerHTML = [
    '<option value="">Selecione…</option>',
    ...MATERIALS_TREE.map((node) => `<option value="${escapeHtml(node.name)}">${escapeHtml(node.name)}</option>`),
  ].join('');
  if (current && MATERIALS_TREE.some((node) => node.name === current)) {
    fields.category.value = current;
  }
}

function syncSubcategorySelect(selectedSubcategory = '') {
  if (!fields.subcategory) return;
  const category = fields.category?.value || '';
  const children = getSubcategories(category);
  const canChoose = hasSubcategories(category);

  fields.subcategory.disabled = !canChoose;
  if (!canChoose) {
    fields.subcategory.innerHTML = '<option value="">—</option>';
    fields.subcategory.value = '';
    return;
  }

  fields.subcategory.innerHTML = [
    '<option value="">Todas / sem subpasta</option>',
    ...children.map((name) => `<option value="${escapeHtml(name)}">${escapeHtml(name)}</option>`),
  ].join('');

  if (selectedSubcategory && children.includes(selectedSubcategory)) {
    fields.subcategory.value = selectedSubcategory;
  } else {
    fields.subcategory.value = '';
  }
}

function resetForm() {
  if (!form) return;
  formTitle.textContent = 'Novo produto';
  form.reset();
  fields.id.value = '';
  fields.existingImages.value = '[]';
  currentImages = [];
  pendingFiles = [];
  previewEl.innerHTML = '';
  statusEl.textContent = '';
  statusEl.className = 'form-status';
  fields.status.value = 'draft';
  fields.featured.checked = false;
  fields.hotmartUrl.value = '';
  populateCategorySelect();
  syncSubcategorySelect('');
}

function renderPreview(existingImages, pendingUploads = []) {
  previewEl.innerHTML = '';
  const renderable = [
    ...existingImages.map((image) => ({ ...image, kind: 'existing' })),
    ...pendingUploads.map((file, index) => ({
      url: URL.createObjectURL(file),
      path: '',
      name: file.name,
      kind: 'pending',
      pendingIndex: index,
    })),
  ];

  renderable.forEach((image) => {
    const thumb = document.createElement('div');
    thumb.className = 'thumb';
    thumb.innerHTML = `
      <img src="${escapeHtml(image.url)}" alt="${escapeHtml(image.name || 'Imagem do produto')}" />
      <button type="button" class="remove-image" aria-label="Remover imagem">×</button>
    `;
    thumb.querySelector('.remove-image').addEventListener('click', () => {
      if (image.kind === 'existing') {
        currentImages = currentImages.filter((item) => item.url !== image.url || item.path !== image.path);
        fields.existingImages.value = JSON.stringify(currentImages);
      } else {
        pendingFiles = pendingFiles.filter((file, idx) => idx !== image.pendingIndex);
      }
      renderPreview(currentImages, pendingFiles);
    });
    previewEl.appendChild(thumb);
  });
}

function formatImages(images) {
  if (!Array.isArray(images)) return [];
  return images.filter(Boolean).map((image) => {
    if (typeof image === 'string') {
      return { url: image, path: '', name: 'Imagem' };
    }
    return image;
  });
}

function firstImage(images) {
  return formatImages(images)[0]?.url || '../images/hero.png';
}

function renderStatusChip(status) {
  const label = STATUS_LABELS[status] || status;
  return `<span class="chip chip-sm ${escapeHtml(status)}">${escapeHtml(label)}</span>`;
}

function formatPrice(product) {
  const price = Number(product.price || 0);
  const promo = product.promo_price != null ? Number(product.promo_price) : null;
  if (promo != null && promo < price) {
    return `<span class="price-promo">${escapeHtml(currency.format(promo))}</span>`;
  }
  return escapeHtml(currency.format(price));
}

function renderProductsTable(rows) {
  if (!rows.length) {
    return '<p class="metric-empty">Nenhum produto cadastrado ainda.</p>';
  }

  return `
    <div class="corp-table-wrap">
      <table class="corp-table corp-table--catalog">
        <thead>
          <tr>
            <th scope="col" class="col-rank">#</th>
            <th scope="col" class="col-product">Produto</th>
            <th scope="col" class="col-price">Preço</th>
            <th scope="col" class="col-status">Status</th>
            <th scope="col" class="col-metric">Views</th>
            <th scope="col" class="col-metric">FB</th>
            <th scope="col" class="col-file">Hotmart</th>
            <th scope="col" class="col-actions">Ações</th>
          </tr>
        </thead>
        <tbody>
          ${rows.map((product, index) => {
            const cover = firstImage(product.images);
            const featured = product.featured
              ? '<span class="chip chip-sm">Destaque</span>'
              : '';
            const metrics = productMetricsById[product.id] || {};
            return `
              <tr data-id="${escapeHtml(product.id)}">
                <td class="col-rank"><span class="rank-badge">${index + 1}</span></td>
                <td class="col-product">
                  <div class="corp-product">
                    <img src="${escapeHtml(cover)}" alt="" loading="lazy" />
                    <div class="corp-product-copy">
                      <span class="corp-product-name" title="${escapeHtml(product.title)}">${escapeHtml(product.title)}</span>
                      <span class="corp-product-meta">${escapeHtml(formatCategoryLabel(product.category, product.subcategory))}</span>
                    </div>
                  </div>
                </td>
                <td class="col-price">${formatPrice(product)}</td>
                <td class="col-status">
                  <div class="table-status-group">
                    ${renderStatusChip(product.status)}
                    ${featured}
                  </div>
                </td>
                <td class="col-metric">${Number(metrics.views || 0)}</td>
                <td class="col-metric">${Number(metrics.facebook_views || 0)}</td>
                <td class="col-file">
                  ${product.hotmart_url
                    ? `<a class="table-link" href="${escapeHtml(product.hotmart_url)}" target="_blank" rel="noopener noreferrer">Abrir</a>`
                    : '<span class="muted">—</span>'}
                </td>
                <td class="col-actions">
                  <div class="table-actions">
                    <button type="button" class="btn-ghost btn-sm" data-action="edit">Editar</button>
                    <button
                      type="button"
                      class="btn-ghost btn-sm btn-facebook${product.facebook_post_id ? ' is-posted' : ''}"
                      data-action="facebook"
                      ${product.status !== 'published' ? 'disabled title="Publique o produto antes de compartilhar no Facebook"' : ''}
                    >${product.facebook_post_id ? 'Repostar FB' : 'Postar no Facebook'}</button>
                    ${product.facebook_post_id ? `
                    <button
                      type="button"
                      class="btn-ghost btn-sm btn-facebook-delete"
                      data-action="facebook-delete"
                    >Excluir postagem</button>` : ''}
                    <button type="button" class="btn-ghost btn-sm btn-danger" data-action="delete">Excluir</button>
                  </div>
                </td>
              </tr>
            `;
          }).join('')}
        </tbody>
      </table>
    </div>
  `;
}

function bindTableActions() {
  if (!listEl) return;

  listEl.querySelectorAll('[data-action="edit"]').forEach((button) => {
    button.addEventListener('click', () => {
      const row = button.closest('tr');
      const id = row?.dataset.id;
      const product = currentProducts.find((item) => item.id === id);
      if (product) openProductModal(product);
    });
  });

  listEl.querySelectorAll('[data-action="facebook"]').forEach((button) => {
    button.addEventListener('click', () => {
      const row = button.closest('tr');
      const id = row?.dataset.id;
      const product = currentProducts.find((item) => item.id === id);
      if (product) openProductFacebookModal(product);
    });
  });

  listEl.querySelectorAll('[data-action="facebook-delete"]').forEach((button) => {
    button.addEventListener('click', () => {
      const row = button.closest('tr');
      const id = row?.dataset.id;
      const product = currentProducts.find((item) => item.id === id);
      if (product) openProductFacebookDeleteModal(product);
    });
  });

  listEl.querySelectorAll('[data-action="delete"]').forEach((button) => {
    button.addEventListener('click', async () => {
      const row = button.closest('tr');
      const id = row?.dataset.id;
      const product = currentProducts.find((item) => item.id === id);
      if (!product) return;
      if (!confirm(`Excluir "${product.title}"?`)) return;
      await deleteProduct(product);
    });
  });
}

function closeProductFacebookModal() {
  facebookModalProduct = null;
  const modalEl = $('product-facebook-modal');
  if (modalEl?.open) modalEl.close();
}

function openProductFacebookModal(product) {
  if (!product || product.status !== 'published') {
    alert('Só é possível postar no Facebook produtos publicados.');
    return;
  }

  facebookModalProduct = product;
  const modalEl = $('product-facebook-modal');
  const titleEl = $('product-facebook-title');
  const linkEl = $('product-facebook-link');
  const messageEl = $('product-facebook-message');
  const alreadyEl = $('product-facebook-already');
  const statusElFb = $('product-facebook-form-status');
  const idEl = $('product-facebook-id');
  const confirmBtn = $('product-facebook-confirm-btn');

  if (!modalEl || !messageEl) return;

  const url = productFacebookShareUrl(product);
  if (idEl) idEl.value = product.id;
  if (titleEl) titleEl.textContent = product.title || '';
  if (linkEl) {
    linkEl.href = url;
    linkEl.textContent = url;
  }
  messageEl.value = defaultProductFacebookMessage(product);
  if (statusElFb) {
    statusElFb.textContent = '';
    statusElFb.className = 'form-status';
  }
  if (alreadyEl) alreadyEl.hidden = !product.facebook_post_id;
  if (confirmBtn) {
    confirmBtn.disabled = false;
    confirmBtn.textContent = product.facebook_post_id ? 'Confirmar e repostar' : 'Confirmar e postar';
  }

  if (typeof modalEl.showModal === 'function') modalEl.showModal();
  else modalEl.setAttribute('open', '');
}

async function submitProductFacebookPost(event) {
  event.preventDefault();
  const statusElFb = $('product-facebook-form-status');
  const confirmBtn = $('product-facebook-confirm-btn');
  const messageEl = $('product-facebook-message');
  const product =
    facebookModalProduct ||
    currentProducts.find((item) => item.id === $('product-facebook-id')?.value);

  if (!product) {
    showResultModal({
      type: 'error',
      title: 'Produto não encontrado',
      message: 'Recarregue a lista e tente novamente.',
    });
    return;
  }

  const message = String(messageEl?.value || '').trim();
  if (!message) {
    if (statusElFb) {
      statusElFb.textContent = 'Escreva uma mensagem para o post.';
      statusElFb.classList.add('error');
    }
    return;
  }

  if (statusElFb) {
    statusElFb.textContent = '';
    statusElFb.className = 'form-status';
  }
  if (confirmBtn) confirmBtn.disabled = true;
  showBusyOverlay('Publicando no Facebook...');

  try {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session?.access_token) {
      throw new Error('Sessão expirada. Faça login novamente.');
    }

    const response = await fetch('/api/products/facebook-post', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({
        id: product.id,
        message,
        force: Boolean(product.facebook_post_id),
      }),
    });

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(payload.error || `HTTP ${response.status}`);
    }

    await loadProducts();
    hideBusyOverlay();
    closeProductFacebookModal();
    showResultModal({
      type: 'success',
      title: 'Postagem publicada',
      message: 'O produto foi publicado na Página do Facebook.',
      linkHref: payload.facebook_url || '',
      linkLabel: 'Ver no Facebook',
    });
  } catch (error) {
    hideBusyOverlay();
    if (confirmBtn) confirmBtn.disabled = false;
    showResultModal({
      type: 'error',
      title: 'Falha ao postar',
      message: error.message || 'Não foi possível publicar no Facebook.',
    });
  }
}

function closeProductFacebookDeleteModal() {
  facebookDeleteModalProduct = null;
  const modalEl = $('product-facebook-delete-modal');
  if (modalEl?.open) modalEl.close();
}

function openProductFacebookDeleteModal(product) {
  if (!product?.facebook_post_id) {
    alert('Este produto não tem postagem registrada no Facebook.');
    return;
  }

  facebookDeleteModalProduct = product;
  const modalEl = $('product-facebook-delete-modal');
  const titleEl = $('product-facebook-delete-title');
  const idEl = $('product-facebook-delete-id');
  const statusElFb = $('product-facebook-delete-form-status');
  const confirmBtn = $('product-facebook-delete-confirm-btn');

  if (!modalEl) return;

  if (idEl) idEl.value = product.id;
  if (titleEl) titleEl.textContent = product.title || '';
  if (statusElFb) {
    statusElFb.textContent = '';
    statusElFb.className = 'form-status';
  }
  if (confirmBtn) {
    confirmBtn.disabled = false;
    confirmBtn.textContent = 'Excluir postagem';
  }

  if (typeof modalEl.showModal === 'function') modalEl.showModal();
  else modalEl.setAttribute('open', '');
}

async function submitProductFacebookDelete(event) {
  event.preventDefault();
  const statusElFb = $('product-facebook-delete-form-status');
  const confirmBtn = $('product-facebook-delete-confirm-btn');
  const product =
    facebookDeleteModalProduct ||
    currentProducts.find((item) => item.id === $('product-facebook-delete-id')?.value);

  if (!product) {
    if (statusElFb) {
      statusElFb.textContent = 'Produto não encontrado.';
      statusElFb.classList.add('error');
    }
    return;
  }

  if (statusElFb) {
    statusElFb.textContent = 'Excluindo postagem no Facebook...';
    statusElFb.className = 'form-status';
  }
  if (confirmBtn) confirmBtn.disabled = true;

  try {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session?.access_token) {
      throw new Error('Sessão expirada. Faça login novamente.');
    }

    const response = await fetch(`/api/products/facebook-post?id=${encodeURIComponent(product.id)}`, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({ id: product.id }),
    });

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(payload.error || `HTTP ${response.status}`);
    }

    if (statusElFb) {
      statusElFb.textContent = payload.already_gone
        ? 'Postagem já não existia no Facebook. Registro local limpo.'
        : 'Postagem excluída do Facebook.';
      statusElFb.className = 'form-status';
    }

    await loadProducts();
    setTimeout(() => closeProductFacebookDeleteModal(), 900);
  } catch (error) {
    if (statusElFb) {
      statusElFb.textContent = error.message || 'Falha ao excluir a postagem do Facebook.';
      statusElFb.classList.add('error');
    }
    if (confirmBtn) confirmBtn.disabled = false;
  }
}

async function uploadFiles(files) {
  const uploads = [];
  for (const file of files) {
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]+/g, '_');
    const path = `products/${crypto.randomUUID()}-${safeName}`;
    const { error: uploadError } = await supabase.storage
      .from(STORAGE_BUCKET)
      .upload(path, file, { contentType: file.type, upsert: false });

    if (uploadError) throw uploadError;

    const { data } = supabase.storage.from(STORAGE_BUCKET).getPublicUrl(path);
    uploads.push({ path, url: data.publicUrl, name: file.name });
  }
  return uploads;
}

export async function loadProducts() {
  if (!listEl) return;

  const [productsRes, metricsRes, fbViewsRes] = await Promise.all([
    supabase
      .from('products')
      .select('*')
      .order('created_at', { ascending: false }),
    supabase
      .from('product_metrics_report')
      .select('id,views,facebook_views'),
    supabase
      .from('product_events')
      .select('product_id')
      .eq('event_type', 'view')
      .eq('source', 'facebook'),
  ]);

  if (productsRes.error) {
    listEl.innerHTML = `<p class="metric-empty">Erro ao carregar produtos: ${escapeHtml(productsRes.error.message)}</p>`;
    return;
  }

  let metricsRows = metricsRes.data || [];
  if (metricsRes.error) {
    const fallback = await supabase
      .from('product_metrics_report')
      .select('id,views');
    if (fallback.error) {
      console.warn('Falha ao carregar métricas de produtos:', metricsRes.error.message);
      metricsRows = [];
    } else {
      metricsRows = (fallback.data || []).map((row) => ({ ...row, facebook_views: 0 }));
    }
  }

  const fbCounts = {};
  for (const row of fbViewsRes.data || []) {
    const id = row.product_id;
    if (!id) continue;
    fbCounts[id] = (fbCounts[id] || 0) + 1;
  }

  productMetricsById = Object.fromEntries(
    metricsRows.map((row) => {
      const fromEvents = fbCounts[row.id];
      const fromView = Number(row.facebook_views || 0);
      return [
        row.id,
        {
          ...row,
          facebook_views: fromEvents != null ? fromEvents : fromView,
        },
      ];
    }),
  );

  for (const [id, count] of Object.entries(fbCounts)) {
    if (!productMetricsById[id]) {
      productMetricsById[id] = { id, views: 0, facebook_views: count };
    } else if (!Number(productMetricsById[id].facebook_views)) {
      productMetricsById[id].facebook_views = count;
    }
  }

  currentProducts = productsRes.data || [];
  if (totalEl) totalEl.textContent = currentProducts.length;
  if (publishedEl) publishedEl.textContent = currentProducts.filter((item) => item.status === 'published').length;
  if (draftEl) draftEl.textContent = currentProducts.filter((item) => item.status === 'draft').length;

  listEl.innerHTML = renderProductsTable(currentProducts);
  bindTableActions();
}

async function loadSocialLinks() {
  if (!socialForm) return;

  const { data, error } = await supabase
    .from('site_settings')
    .select('instagram_url,facebook_url')
    .eq('id', 1)
    .maybeSingle();

  if (error) {
    socialStatusEl.textContent = `Erro ao carregar links sociais: ${error.message}`;
    socialStatusEl.classList.add('error');
    return;
  }

  fields.instagramUrl.value = data?.instagram_url || '';
  fields.facebookUrl.value = data?.facebook_url || '';
  socialStatusEl.textContent = '';
  socialStatusEl.className = 'form-status';
}

function syncMetricsEmailStateLabel(enabled) {
  if (!metricsEmailStateLabelEl) return;
  metricsEmailStateLabelEl.dataset.state = enabled ? 'on' : 'off';
  metricsEmailStateLabelEl.textContent = enabled
    ? 'Relatório automático ligado'
    : 'Relatório desligado';
}

function formatBrazilDateTime(value) {
  if (!value) return '—';
  try {
    return new Intl.DateTimeFormat('pt-BR', {
      timeZone: 'America/Sao_Paulo',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(value));
  } catch {
    return String(value);
  }
}

function renderMetricsEmailMeta(data) {
  if (!metricsEmailMetaEl) return;
  const lastSent = formatBrazilDateTime(data?.metrics_email_last_sent_at);
  const lastError = String(data?.metrics_email_last_error || '').trim();
  const lines = [`Último envio: ${lastSent} (BRT)`];
  if (lastError) {
    lines.push(`Último erro: ${lastError}`);
  }
  metricsEmailMetaEl.textContent = lines.join('\n');
}

function parseRecipientsInput(raw) {
  return String(raw || '')
    .split(/[,;\n]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

async function loadMetricsEmailSettings() {
  if (!metricsEmailForm) return;

  const { data, error } = await supabase
    .from('site_settings')
    .select(
      'metrics_email_enabled,metrics_email_recipients,metrics_email_time,metrics_email_last_sent_at,metrics_email_last_error',
    )
    .eq('id', 1)
    .maybeSingle();

  if (error) {
    metricsEmailStatusEl.textContent = `Erro ao carregar relatório: ${error.message}`;
    metricsEmailStatusEl.classList.add('error');
    return;
  }

  const enabled = Boolean(data?.metrics_email_enabled);
  fields.metricsEmailEnabled.checked = enabled;
  fields.metricsEmailTime.value = data?.metrics_email_time || '08:00';
  fields.metricsEmailRecipients.value = data?.metrics_email_recipients || '';
  syncMetricsEmailStateLabel(enabled);
  renderMetricsEmailMeta(data);
  metricsEmailStatusEl.textContent = '';
  metricsEmailStatusEl.className = 'form-status';
}

function editProduct(product) {
  formTitle.textContent = 'Editar produto';
  fields.id.value = product.id;
  fields.title.value = product.title || '';
  populateCategorySelect();
  const category = product.category || '';
  if (category && !MATERIALS_TREE.some((node) => node.name === category)) {
    const opt = document.createElement('option');
    opt.value = category;
    opt.textContent = `${category} (legado)`;
    fields.category.appendChild(opt);
  }
  fields.category.value = category;
  syncSubcategorySelect(product.subcategory || '');
  fields.hotmartUrl.value = product.hotmart_url || '';
  fields.description.value = product.description || '';
  fields.price.value = product.price ?? '';
  fields.promoPrice.value = product.promo_price ?? '';
  fields.promoStart.value = product.promo_start || '';
  fields.promoEnd.value = product.promo_end || '';
  fields.status.value = product.status || 'draft';
  fields.featured.checked = Boolean(product.featured);
  currentImages = formatImages(product.images);
  pendingFiles = [];
  fields.existingImages.value = JSON.stringify(currentImages);
  statusEl.textContent = '';
  statusEl.className = 'form-status';
  renderPreview(currentImages, pendingFiles);
}

async function deleteProduct(product) {
  const images = formatImages(product.images);
  if (images.length) {
    const paths = images.map((image) => image.path).filter(Boolean);
    if (paths.length) {
      await supabase.storage.from(STORAGE_BUCKET).remove(paths);
    }
  }

  const { error } = await supabase.from('products').delete().eq('id', product.id);
  if (error) {
    alert(`Erro ao excluir: ${error.message}`);
    return;
  }

  await loadProducts();
  if (fields.id.value === product.id) {
    resetForm();
    closeProductModal();
  }
}

function bindProductsForm() {
  if (productsBound || !form) return;
  productsBound = true;

  populateCategorySelect();
  syncSubcategorySelect('');
  fields.category?.addEventListener('change', () => {
    syncSubcategorySelect('');
  });

  newBtn?.addEventListener('click', () => openProductModal());
  cancelBtn?.addEventListener('click', () => {
    resetForm();
    closeProductModal();
  });
  closeBtn?.addEventListener('click', () => {
    resetForm();
    closeProductModal();
  });

  modal?.addEventListener('cancel', (event) => {
    event.preventDefault();
    resetForm();
    closeProductModal();
  });

  modal?.addEventListener('click', (event) => {
    if (event.target === modal) {
      resetForm();
      closeProductModal();
    }
  });

  $('product-facebook-form')?.addEventListener('submit', submitProductFacebookPost);
  $('product-facebook-cancel-btn')?.addEventListener('click', closeProductFacebookModal);
  $('product-facebook-modal-close')?.addEventListener('click', closeProductFacebookModal);
  $('product-facebook-modal')?.addEventListener('cancel', (event) => {
    event.preventDefault();
    closeProductFacebookModal();
  });
  $('product-facebook-delete-form')?.addEventListener('submit', submitProductFacebookDelete);
  $('product-facebook-delete-cancel-btn')?.addEventListener('click', closeProductFacebookDeleteModal);
  $('product-facebook-delete-modal-close')?.addEventListener('click', closeProductFacebookDeleteModal);
  $('product-facebook-delete-modal')?.addEventListener('cancel', (event) => {
    event.preventDefault();
    closeProductFacebookDeleteModal();
  });

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    statusEl.textContent = 'Salvando...';
    statusEl.className = 'form-status';

    const fireSwal = (options) => {
      if (window.Swal?.fire) return window.Swal.fire(options);
      window.alert(options?.text || options?.title || '');
      return Promise.resolve();
    };

    try {
      if (window.Swal?.fire) {
        window.Swal.fire({
          title: 'Salvando produto...',
          text: 'Aguarde enquanto gravamos as alterações.',
          allowOutsideClick: false,
          allowEscapeKey: false,
          didOpen: () => {
            window.Swal?.showLoading?.();
          },
        });
      }

      const existing = JSON.parse(fields.existingImages.value || '[]');
      const uploaded = pendingFiles.length ? await uploadFiles(pendingFiles) : [];
      const images = [...existing, ...uploaded];

      const title = fields.title.value.trim();
      const slug = buildInternalSlug(title);

      const category = fields.category.value.trim();
      if (!category) {
        throw new Error('Selecione uma categoria.');
      }
      const subcategory = hasSubcategories(category)
        ? (fields.subcategory?.value || '').trim()
        : '';

      const payload = {
        title,
        slug,
        category,
        subcategory,
        hotmart_url: fields.hotmartUrl.value.trim(),
        description: fields.description.value.trim(),
        price: Number(fields.price.value || 0),
        promo_price: fields.promoPrice.value ? Number(fields.promoPrice.value) : null,
        promo_start: fields.promoStart.value || null,
        promo_end: fields.promoEnd.value || null,
        status: fields.status.value,
        featured: fields.featured.checked,
        images,
        updated_at: new Date().toISOString(),
      };

      const id = fields.id.value || null;
      let error = null;

      if (id) {
        ({ error } = await supabase.from('products').update(payload).eq('id', id));
      } else {
        ({ error } = await supabase.from('products').insert(payload));
      }

      if (error) throw error;

      statusEl.textContent = 'Produto salvo com sucesso.';
      resetForm();
      closeProductModal();
      await loadProducts();
      await fireSwal({
        icon: 'success',
        title: 'Produto salvo',
        text: 'As alterações foram gravadas com sucesso.',
        confirmButtonText: 'OK',
      });
    } catch (error) {
      statusEl.textContent = error.message;
      statusEl.classList.add('error');
      await fireSwal({
        icon: 'error',
        title: 'Erro ao salvar',
        text: error.message || 'Não foi possível salvar o produto.',
        confirmButtonText: 'Entendi',
      });
    }
  });

  fields.images?.addEventListener('change', () => {
    pendingFiles = Array.from(fields.images.files || []);
    renderPreview(currentImages, pendingFiles);
  });
}

function bindSettingsForm() {
  if (settingsBound || !socialForm) return;
  settingsBound = true;

  socialForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    socialStatusEl.textContent = 'Salvando links...';
    socialStatusEl.className = 'form-status';

    try {
      const payload = {
        id: 1,
        instagram_url: fields.instagramUrl.value.trim(),
        facebook_url: fields.facebookUrl.value.trim(),
        updated_at: new Date().toISOString(),
      };

      const { error } = await supabase.from('site_settings').upsert(payload, { onConflict: 'id' });
      if (error) throw error;

      socialStatusEl.textContent = 'Links salvos com sucesso.';
      socialStatusEl.className = 'form-status';
    } catch (error) {
      socialStatusEl.textContent = error.message;
      socialStatusEl.classList.add('error');
    }
  });
}

function bindMetricsEmailForm() {
  if (metricsEmailBound || !metricsEmailForm) return;
  metricsEmailBound = true;

  fields.metricsEmailEnabled?.addEventListener('change', () => {
    syncMetricsEmailStateLabel(Boolean(fields.metricsEmailEnabled.checked));
  });

  metricsEmailForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    metricsEmailStatusEl.textContent = 'Salvando relatório...';
    metricsEmailStatusEl.className = 'form-status';

    try {
      const recipients = parseRecipientsInput(fields.metricsEmailRecipients.value);
      const invalid = recipients.filter((email) => !isValidEmail(email));
      if (invalid.length) {
        throw new Error(`E-mails inválidos: ${invalid.join(', ')}`);
      }

      const enabled = Boolean(fields.metricsEmailEnabled.checked);
      if (enabled && !recipients.length) {
        throw new Error('Informe ao menos um destinatário para ligar o envio automático.');
      }

      const time = fields.metricsEmailTime.value || '08:00';
      const payload = {
        id: 1,
        metrics_email_enabled: enabled,
        metrics_email_recipients: recipients.join('\n'),
        metrics_email_time: time,
        updated_at: new Date().toISOString(),
      };

      const { error } = await supabase.from('site_settings').upsert(payload, { onConflict: 'id' });
      if (error) throw error;

      syncMetricsEmailStateLabel(enabled);
      metricsEmailStatusEl.textContent = 'Configuração do relatório salva com sucesso.';
      metricsEmailStatusEl.className = 'form-status';
      await loadMetricsEmailSettings();
    } catch (error) {
      metricsEmailStatusEl.textContent = error.message;
      metricsEmailStatusEl.classList.add('error');
    }
  });

  metricsEmailSendNowBtn?.addEventListener('click', async () => {
    metricsEmailStatusEl.textContent = 'Salvando e enviando relatório...';
    metricsEmailStatusEl.className = 'form-status';
    metricsEmailSendNowBtn.disabled = true;

    try {
      const recipients = parseRecipientsInput(fields.metricsEmailRecipients.value);
      const invalid = recipients.filter((email) => !isValidEmail(email));
      if (invalid.length) {
        throw new Error(`E-mails inválidos: ${invalid.join(', ')}`);
      }
      if (!recipients.length) {
        throw new Error('Informe ao menos um destinatário antes de enviar.');
      }

      const time = fields.metricsEmailTime.value || '08:00';
      const { error: saveError } = await supabase.from('site_settings').upsert(
        {
          id: 1,
          metrics_email_enabled: Boolean(fields.metricsEmailEnabled.checked),
          metrics_email_recipients: recipients.join('\n'),
          metrics_email_time: time,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'id' },
      );
      if (saveError) throw saveError;

      const {
        data: { session },
        error: sessionError,
      } = await supabase.auth.getSession();
      if (sessionError) throw sessionError;
      if (!session?.access_token) {
        throw new Error('Sessão expirada. Faça login novamente.');
      }

      const response = await fetch('/api/metrics-report?force=1', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ force: true }),
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload.error || 'Falha ao enviar o relatório.');
      }

      metricsEmailStatusEl.textContent = `Relatório enviado para ${payload.recipients?.join(', ') || 'os destinatários'}.`;
      metricsEmailStatusEl.className = 'form-status';
      await loadMetricsEmailSettings();
    } catch (error) {
      metricsEmailStatusEl.textContent = error.message;
      metricsEmailStatusEl.classList.add('error');
    } finally {
      metricsEmailSendNowBtn.disabled = false;
    }
  });
}

export async function initProducts() {
  if (!form || !listEl) return;
  bindProductsForm();
  await loadProducts();
}

export async function initSettings() {
  if (socialForm) {
    bindSettingsForm();
    await loadSocialLinks();
  }
  if (metricsEmailForm) {
    bindMetricsEmailForm();
    await loadMetricsEmailSettings();
  }
}
