import { supabase } from './supabase-client.js';
import { STORAGE_BUCKET } from './config.js';

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

const fields = {
  id: document.getElementById('product-id'),
  existingImages: document.getElementById('existing-images'),
  title: document.getElementById('title'),
  slug: document.getElementById('slug'),
  category: document.getElementById('category'),
  description: document.getElementById('description'),
  price: document.getElementById('price'),
  promoPrice: document.getElementById('promo-price'),
  promoStart: document.getElementById('promo-start'),
  promoEnd: document.getElementById('promo-end'),
  publishedAt: document.getElementById('published-at'),
  status: document.getElementById('status'),
  featured: document.getElementById('featured'),
  images: document.getElementById('images'),
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
  fields.publishedAt.valueAsDate = new Date();
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

function editProduct(product) {
  formTitle.textContent = 'Editar produto';
  fields.id.value = product.id;
  fields.title.value = product.title || '';
  fields.slug.value = product.slug || '';
  fields.category.value = product.category || '';
  fields.description.value = product.description || '';
  fields.price.value = product.price ?? '';
  fields.promoPrice.value = product.promo_price ?? '';
  fields.promoStart.value = product.promo_start || '';
  fields.promoEnd.value = product.promo_end || '';
  fields.publishedAt.value = product.published_at || '';
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

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  statusEl.textContent = 'Salvando...';
  statusEl.className = 'form-status';

  try {
    const existing = JSON.parse(fields.existingImages.value || '[]');
    const uploaded = pendingFiles.length ? await uploadFiles(pendingFiles) : [];
    const images = [...existing, ...uploaded];

    const title = fields.title.value.trim();
    const slug = fields.slug.value.trim() || slugify(title);

    const payload = {
      title,
      slug,
      category: fields.category.value.trim(),
      description: fields.description.value.trim(),
      price: Number(fields.price.value || 0),
      promo_price: fields.promoPrice.value ? Number(fields.promoPrice.value) : null,
      promo_start: fields.promoStart.value || null,
      promo_end: fields.promoEnd.value || null,
      published_at: fields.publishedAt.value || new Date().toISOString().slice(0, 10),
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

fields.title.addEventListener('input', () => {
  if (!fields.slug.value.trim()) {
    fields.slug.value = slugify(fields.title.value);
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
  await loadProducts();
}
