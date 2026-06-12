import { supabase } from './supabase-client.js';

const grid = document.getElementById('products-grid');
const currency = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

function safeText(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  })[char]);
}

function normalizeImages(images) {
  if (!Array.isArray(images)) return [];
  return images
    .map((image) => {
      if (!image) return null;
      if (typeof image === 'string') return { url: image, path: '', name: '' };
      return image;
    })
    .filter(Boolean);
}

function isPromoActive(product) {
  if (!product.promo_price) return false;
  const today = new Date();
  const start = product.promo_start ? new Date(`${product.promo_start}T00:00:00`) : null;
  const end = product.promo_end ? new Date(`${product.promo_end}T23:59:59`) : null;
  if (start && today < start) return false;
  if (end && today > end) return false;
  return true;
}

function getTag(product) {
  if (product.featured) return { label: 'Destaque', className: 'pink' };
  if (isPromoActive(product)) return { label: 'Oferta', className: 'yellow' };
  const published = product.published_at ? new Date(`${product.published_at}T00:00:00`) : null;
  if (published) {
    const diffDays = Math.floor((Date.now() - published.getTime()) / 86400000);
    if (diffDays <= 30) return { label: 'Novo', className: 'teal' };
  }
  return null;
}

function renderStars() {
  return '&#9733;&#9733;&#9733;&#9733;&#9733;';
}

function renderProduct(product, index) {
  const images = normalizeImages(product.images);
  const firstImage = images[0]?.url || './images/hero.png';
  const tag = getTag(product);
  const price = isPromoActive(product) && product.promo_price ? product.promo_price : product.price;
  const formattedPrice = currency.format(Number(price || 0));
  const ratingCount = product.rating_count ?? [128, 96, 74, 84, 67, 52][index % 6];
  const title = safeText(product.title);
  const category = safeText(product.category || 'Sem categoria');
  const description = safeText(product.description || 'Material disponível para uso pedagógico.');
  const detailsButton = `<a class="product-details" href="./product.html?id=${encodeURIComponent(product.id)}">Detalhes</a>`;

  return `
    <article class="product">
      ${tag ? `<span class="tag ${tag.className}">${tag.label}</span>` : ''}
      <div class="product-media">
        <img src="${firstImage}" alt="${title}" loading="lazy" />
      </div>
      <h3>${title}</h3>
      <p class="product-category">${category}</p>
      <p class="product-description">${description}</p>
      <div class="price">${formattedPrice}</div>
      <div class="stars">${renderStars()} <span style="color:var(--muted); font-size:.9rem;">(${ratingCount})</span></div>
      <div class="product-actions">
        ${detailsButton}
        <span class="product-add">+</span>
      </div>
    </article>
  `;
}

async function loadProducts() {
  const { data, error } = await supabase
    .from('products')
    .select('id,title,description,category,hotmart_url,price,promo_price,promo_start,promo_end,published_at,status,featured,images')
    .eq('status', 'published')
    .order('featured', { ascending: false })
    .order('published_at', { ascending: false })
    .limit(6);

  if (error) {
    grid.innerHTML = `<article class="product"><h3>Erro ao carregar produtos</h3><p>${safeText(error.message)}</p></article>`;
    return;
  }

  if (!data || !data.length) {
    grid.innerHTML = `<article class="product"><h3>Nenhum produto publicado ainda</h3><p>Cadastre um produto no painel admin e publique para aparecer aqui.</p></article>`;
    return;
  }

  grid.innerHTML = data.map(renderProduct).join('');
}

loadProducts();
