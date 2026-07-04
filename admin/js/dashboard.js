import { supabase } from './supabase-client.js';
import { STORAGE_BUCKET } from './config.js';
import { initFreeMaterialsAdmin } from './free-materials-admin.js';

const form = document.getElementById('product-form');
const statusEl = document.getElementById('form-status');
const listEl = document.getElementById('products-list');
const clearBtn = document.getElementById('clear-btn');
const logoutBtn = document.getElementById('logout-btn');
const formTitle = document.getElementById('form-title');
const previewEl = document.getElementById('image-preview');
const totalEl = document.getElementById('count-total');
const publishedEl = document.getElementById('count-published');
const draftEl = document.getElementById('count-draft');
const metricViewsEl = document.getElementById('metric-views');
const metricUniqueViewsEl = document.getElementById('metric-unique-views');
const metricOpensEl = document.getElementById('metric-opens');
const metricBuyClicksEl = document.getElementById('metric-buy-clicks');
const metricConversionEl = document.getElementById('metric-conversion');
const metricsListEl = document.getElementById('metrics-list');
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

let currentProducts = [];
let currentImages = [];
let pendingFiles = [];

const currency = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

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

async function requireAdmin() {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) {
    window.location.href = './';
    return null;
  }
  return session;
}

async function ensureAdminRole() {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return false;

  const { data, error } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .maybeSingle();

  if (error) {
    statusEl.textContent = 'Nao foi possivel validar permissao de admin.';
    statusEl.classList.add('error');
    return false;
  }

  if (!data || data.role !== 'admin') {
    statusEl.textContent = 'Este usuario nao possui permissao de admin.';
    statusEl.classList.add('error');
    await supabase.auth.signOut();
    window.location.href = './';
    return false;
  }

  return true;
}

function resetForm() {
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
      <img src="${image.url}" alt="${image.name || 'Imagem do produto'}" />
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

async function loadProducts() {
  const { data, error } = await supabase
    .from('products')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    listEl.innerHTML = `<p class="muted">Erro ao carregar produtos: ${error.message}</p>`;
    return;
  }

  currentProducts = data || [];
  totalEl.textContent = currentProducts.length;
  publishedEl.textContent = currentProducts.filter((item) => item.status === 'published').length;
  draftEl.textContent = currentProducts.filter((item) => item.status === 'draft').length;

  if (!currentProducts.length) {
    listEl.innerHTML = '<p class="muted">Nenhum produto cadastrado ainda.</p>';
    return;
  }

  listEl.innerHTML = '';
  currentProducts.forEach((product) => {
    const wrapper = document.createElement('div');
    wrapper.className = 'product-row';

    const firstImage = formatImages(product.images)[0]?.url || '../images/hero.png';

    wrapper.innerHTML = `
      <img src="${firstImage}" alt="${product.title}" />
      <div class="product-meta">
        <h3>${product.title}</h3>
        <p>${product.category || 'Sem categoria'} • ${currency.format(Number(product.price || 0))}</p>
        <div class="product-actions-row">
          <span class="chip ${product.status}">${product.status}</span>
          ${product.featured ? '<span class="chip">Destaque</span>' : ''}
          <span class="chip">${formatImages(product.images).length} imagens</span>
        </div>
      </div>
      <div class="product-actions-row">
        <button type="button" class="btn-ghost" data-action="edit">Editar</button>
        <button type="button" class="btn-ghost" data-action="delete">Excluir</button>
      </div>
    `;

    wrapper.querySelector('[data-action="edit"]').addEventListener('click', () => {
      editProduct(product);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });

    wrapper.querySelector('[data-action="delete"]').addEventListener('click', async () => {
      if (!confirm(`Excluir "${product.title}"?`)) return;
      await deleteProduct(product);
    });

    listEl.appendChild(wrapper);
  });
}

function formatPercent(value) {
  return `${Math.round(value * 100)}%`;
}

async function loadMetrics() {
  if (!metricsListEl) return;

  const { data, error } = await supabase
    .from('product_metrics_report')
    .select('id,title,category,status,views,unique_views,opens,buy_clicks,last_event_at')
    .order('views', { ascending: false })
    .order('buy_clicks', { ascending: false });

  if (error) {
    metricsListEl.innerHTML = `<p class="metric-empty">Erro ao carregar métricas: ${error.message}</p>`;
    return;
  }

  const rows = data || [];
  const totals = rows.reduce((acc, item) => {
    acc.views += Number(item.views || 0);
    acc.uniqueViews += Number(item.unique_views || 0);
    acc.opens += Number(item.opens || 0);
    acc.buyClicks += Number(item.buy_clicks || 0);
    return acc;
  }, { views: 0, uniqueViews: 0, opens: 0, buyClicks: 0 });

  if (metricViewsEl) metricViewsEl.textContent = totals.views;
  if (metricUniqueViewsEl) metricUniqueViewsEl.textContent = totals.uniqueViews;
  if (metricOpensEl) metricOpensEl.textContent = totals.opens;
  if (metricBuyClicksEl) metricBuyClicksEl.textContent = totals.buyClicks;
  if (metricConversionEl) {
    const rate = totals.views > 0 ? totals.buyClicks / totals.views : 0;
    metricConversionEl.textContent = formatPercent(rate);
  }

  if (!rows.length) {
    metricsListEl.innerHTML = '<p class="metric-empty">Ainda não há eventos registrados.</p>';
    return;
  }

  const topRows = rows.slice(0, 5);
  metricsListEl.innerHTML = `
    <div class="metric-row head">
      <div>Produto</div>
      <div class="metric-value">Vis.</div>
      <div class="metric-value">Abert.</div>
      <div class="metric-value">Compras</div>
      <div class="metric-value">Conv.</div>
      <div>Último evento</div>
    </div>
    ${topRows.map((item) => {
      const conversion = item.views > 0 ? Number(item.buy_clicks || 0) / Number(item.views || 1) : 0;
      const lastEvent = item.last_event_at ? new Date(item.last_event_at).toLocaleString('pt-BR') : 'Sem dados';
      return `
        <div class="metric-row">
          <div>
            <div class="metric-product">${item.title}</div>
            <div class="muted">${item.category || 'Sem categoria'}</div>
          </div>
          <div class="metric-value">${item.views || 0}</div>
          <div class="metric-value">${item.opens || 0}</div>
          <div class="metric-value">${item.buy_clicks || 0}</div>
          <div class="metric-value metric-rate">${formatPercent(conversion)}</div>
          <div class="muted">${lastEvent}</div>
        </div>
      `;
    }).join('')}
  `;
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
  if (fields.id.value === product.id) resetForm();
}

socialForm?.addEventListener('submit', async (event) => {
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
    await loadProducts();
  } catch (error) {
    statusEl.textContent = error.message;
    statusEl.classList.add('error');
  }
});

fields.images.addEventListener('change', () => {
  pendingFiles = Array.from(fields.images.files || []);
  renderPreview(currentImages, pendingFiles);
});

clearBtn.addEventListener('click', resetForm);
logoutBtn.addEventListener('click', async () => {
  await supabase.auth.signOut();
  window.location.href = './';
});

await requireAdmin();
const isAdmin = await ensureAdminRole();
if (isAdmin) {
  resetForm();
  await Promise.all([loadProducts(), loadMetrics(), loadSocialLinks(), initFreeMaterialsAdmin()]);
}
