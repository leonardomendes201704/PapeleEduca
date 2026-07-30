import { formatCategoryLabel } from './materiais-taxonomy.js';

const currency = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

export function safeText(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  })[char]);
}

export function normalizeImages(images) {
  if (!Array.isArray(images)) return [];
  return images
    .map((image) => {
      if (!image) return null;
      if (typeof image === 'string') return { url: image, path: '', name: '' };
      return image;
    })
    .filter(Boolean);
}

export function isPromoActive(product) {
  if (!product.promo_price) return false;
  const today = new Date();
  const start = product.promo_start ? new Date(`${product.promo_start}T00:00:00`) : null;
  const end = product.promo_end ? new Date(`${product.promo_end}T23:59:59`) : null;
  if (start && today < start) return false;
  if (end && today > end) return false;
  return true;
}

export function getProductTag(product) {
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

export function renderProductCard(product, index = 0, options = {}) {
  const images = normalizeImages(product.images);
  const firstImage = images[0]?.url || options.imageFallback || './images/hero.png';
  const tag = getProductTag(product);
  const price = isPromoActive(product) && product.promo_price ? product.promo_price : product.price;
  const formattedPrice = currency.format(Number(price || 0));
  const ratingCount = product.rating_count ?? [128, 96, 74, 84, 67, 52][index % 6];
  const title = safeText(product.title);
  const category = safeText(formatCategoryLabel(product.category, product.subcategory));
  const description = safeText(product.description || 'Material disponível para uso pedagógico.');
  const detailsHref = options.detailsHref || '#';

  return `
    <a class="product" href="${detailsHref}" data-product-id="${safeText(product.id)}" aria-label="Abrir detalhes de ${title}">
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
        <span class="product-details">Detalhes</span>
        <span class="product-add">+</span>
      </div>
    </a>
  `;
}
