import { supabase } from './supabase-client.js';
import { STORAGE_BUCKET } from './config.js';

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

const fields = {
  id: document.getElementById('product-id'),
  existingImages: document.getElementById('existing-images'),
  title: document.getElementById('title'),
  category: document.getElementById('category'),
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
};

const STATUS_LABELS = {
  published: 'Publicado',
  draft: 'Rascunho',
  archived: 'Arquivado',
};

let currentProducts = [];
let currentImages = [];
let pendingFiles = [];
let productsBound = false;
let settingsBound = false;

const currency = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  })[char]);
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
            return `
              <tr data-id="${escapeHtml(product.id)}">
                <td class="col-rank"><span class="rank-badge">${index + 1}</span></td>
                <td class="col-product">
                  <div class="corp-product">
                    <img src="${escapeHtml(cover)}" alt="" loading="lazy" />
                    <div class="corp-product-copy">
                      <span class="corp-product-name" title="${escapeHtml(product.title)}">${escapeHtml(product.title)}</span>
                      <span class="corp-product-meta">${escapeHtml(product.category || 'Sem categoria')}</span>
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
                <td class="col-file">
                  ${product.hotmart_url
                    ? `<a class="table-link" href="${escapeHtml(product.hotmart_url)}" target="_blank" rel="noopener noreferrer">Abrir</a>`
                    : '<span class="muted">—</span>'}
                </td>
                <td class="col-actions">
                  <div class="table-actions">
                    <button type="button" class="btn-ghost btn-sm" data-action="edit">Editar</button>
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

  const { data, error } = await supabase
    .from('products')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    listEl.innerHTML = `<p class="metric-empty">Erro ao carregar produtos: ${escapeHtml(error.message)}</p>`;
    return;
  }

  currentProducts = data || [];
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

function editProduct(product) {
  formTitle.textContent = 'Editar produto';
  fields.id.value = product.id;
  fields.title.value = product.title || '';
  fields.category.value = product.category || '';
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

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    statusEl.textContent = 'Salvando...';
    statusEl.className = 'form-status';

    try {
      const existing = JSON.parse(fields.existingImages.value || '[]');
      const uploaded = pendingFiles.length ? await uploadFiles(pendingFiles) : [];
      const images = [...existing, ...uploaded];

      const title = fields.title.value.trim();
      const slug = buildInternalSlug(title);

      const payload = {
        title,
        slug,
        category: fields.category.value.trim(),
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
    } catch (error) {
      statusEl.textContent = error.message;
      statusEl.classList.add('error');
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

export async function initProducts() {
  if (!form || !listEl) return;
  bindProductsForm();
  await loadProducts();
}

export async function initSettings() {
  if (!socialForm) return;
  bindSettingsForm();
  await loadSocialLinks();
}
