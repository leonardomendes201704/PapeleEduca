import { supabase } from './supabase-client.js';
import { renderProductCard } from './product-card.js';

const root = document.getElementById('product-root');
const relatedRoot = document.getElementById('related-products');
const relatedPrevButton = document.getElementById('related-prev');
const relatedNextButton = document.getElementById('related-next');
const currency = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
let galleryImages = [];
let activeImageIndex = 0;
let lightboxEl = null;

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
  if (product.featured) return 'Destaque';
  if (isPromoActive(product)) return 'Oferta';
  return 'Material disponível';
}

function getQueryId() {
  const params = new URLSearchParams(window.location.search);
  return params.get('id');
}

function getFallbackImages() {
  return [{ url: './images/hero.png', path: '', name: 'Imagem do produto' }];
}

function setActiveImage(index) {
  if (!galleryImages.length) return;
  activeImageIndex = (index + galleryImages.length) % galleryImages.length;

  const mainImageEl = document.getElementById('main-image');
  const lightboxImageEl = document.getElementById('lightbox-image');
  const currentImage = galleryImages[activeImageIndex];

  if (mainImageEl && currentImage) {
    mainImageEl.src = currentImage.url;
    mainImageEl.alt = `${safeText(currentImage.name || 'Imagem do produto')} - imagem ${activeImageIndex + 1}`;
  }

  if (lightboxImageEl && currentImage) {
    lightboxImageEl.src = currentImage.url;
    lightboxImageEl.alt = `${safeText(currentImage.name || 'Imagem do produto')} - imagem ${activeImageIndex + 1}`;
  }

  root.querySelectorAll('.thumbs button').forEach((button, buttonIndex) => {
    button.classList.toggle('active', buttonIndex === activeImageIndex);
  });
}

function openLightbox(index = activeImageIndex) {
  if (!galleryImages.length) return;
  activeImageIndex = index;
  setActiveImage(activeImageIndex);

  if (lightboxEl) {
    lightboxEl.classList.add('is-open');
    lightboxEl.setAttribute('aria-hidden', 'false');
    document.body.classList.add('lightbox-open');
  }
}

function closeLightbox() {
  if (lightboxEl) {
    lightboxEl.classList.remove('is-open');
    lightboxEl.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('lightbox-open');
  }
}

function ensureLightbox() {
  if (lightboxEl) return lightboxEl;

  lightboxEl = document.createElement('div');
  lightboxEl.className = 'lightbox';
  lightboxEl.setAttribute('aria-hidden', 'true');
  lightboxEl.innerHTML = `
    <div class="lightbox-backdrop" data-lightbox-close></div>
    <div class="lightbox-dialog" role="dialog" aria-modal="true" aria-label="Visualização ampliada da imagem">
      <button type="button" class="lightbox-close" aria-label="Fechar imagem ampliada" data-lightbox-close>×</button>
      <button type="button" class="lightbox-nav lightbox-prev" aria-label="Imagem anterior" data-lightbox-prev>‹</button>
      <img id="lightbox-image" src="" alt="" />
      <button type="button" class="lightbox-nav lightbox-next" aria-label="Próxima imagem" data-lightbox-next>›</button>
    </div>
  `;

  document.body.appendChild(lightboxEl);

  lightboxEl.addEventListener('click', (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    if (target.matches('[data-lightbox-close]')) closeLightbox();
    if (target.matches('[data-lightbox-prev]')) setActiveImage(activeImageIndex - 1);
    if (target.matches('[data-lightbox-next]')) setActiveImage(activeImageIndex + 1);
  });

  document.addEventListener('keydown', (event) => {
    if (!lightboxEl?.classList.contains('is-open')) return;
    if (event.key === 'Escape') closeLightbox();
    if (event.key === 'ArrowLeft') setActiveImage(activeImageIndex - 1);
    if (event.key === 'ArrowRight') setActiveImage(activeImageIndex + 1);
  });

  return lightboxEl;
}

function renderProduct(product) {
  galleryImages = normalizeImages(product.images);
  if (!galleryImages.length) {
    galleryImages = getFallbackImages();
  }
  activeImageIndex = 0;
  const title = safeText(product.title);
  const category = safeText(product.category || 'Sem categoria');
  const description = safeText(product.description || 'Material disponível para uso pedagógico.');
  const currentPrice = isPromoActive(product) && product.promo_price ? product.promo_price : product.price;
  const promoPrice = product.promo_price ? currency.format(Number(product.promo_price)) : '';
  const price = currency.format(Number(currentPrice || 0));
  const buyUrl = typeof product.hotmart_url === 'string' ? product.hotmart_url.trim() : '';
  const thumbs = galleryImages.length > 1
    ? galleryImages.map((image, index) => `
      <button type="button" class="thumb ${index === 0 ? 'active' : ''}" data-index="${index}" aria-label="Ver imagem ${index + 1}">
        <img src="${image.url}" alt="${safeText(image.name || `${title} - imagem ${index + 1}`)}" />
      </button>
    `).join('')
    : '';

  root.innerHTML = `
    <div class="detail-grid">
      <div class="gallery">
        <button type="button" class="main-image" id="main-image-trigger" aria-label="Abrir imagem em tamanho ampliado">
          <img id="main-image" src="${galleryImages[0].url}" alt="${title}" />
          <span class="main-image-hint">Clique para ampliar</span>
        </button>
        ${galleryImages.length > 1 ? `
          <div class="carousel-controls">
            <button type="button" class="carousel-arrow" id="carousel-prev" aria-label="Imagem anterior">‹</button>
            <button type="button" class="carousel-arrow" id="carousel-next" aria-label="Próxima imagem">›</button>
          </div>
          <div class="thumbs">
            ${thumbs}
          </div>
        ` : ''}
      </div>

      <article class="product-panel">
        <span class="eyebrow">${getTag(product)}</span>
        <h1>${title}</h1>
        <div class="meta">
          <span class="pill">${category}</span>
          <span class="pill">${formatPublished(product.published_at)}</span>
        </div>

        <div class="price-box">
          ${promoPrice ? `<div class="promo">Oferta: ${promoPrice}</div>` : ''}
          <div class="price">${price}</div>
          <div class="muted">Pagamento e entrega finalizados pela Hotmart.</div>
        </div>

        <div class="description">${description}</div>

        <ul class="bullets">
          <li>Material digital pronto para usar em casa ou na sala de aula.</li>
          <li>Acesso r&aacute;pido pela Hotmart ap&oacute;s a confirma&ccedil;&atilde;o da compra.</li>
          <li>Conte&uacute;do pensado para facilitar o dia a dia de educadores e fam&iacute;lias.</li>
        </ul>

        <div class="actions">
          ${buyUrl
            ? `<a class="btn buy-now" href="${buyUrl}" target="_blank" rel="noopener noreferrer">Comprar agora</a>`
            : `<span class="btn buy-now" style="opacity:.7; pointer-events:none;">Comprar agora</span>`}
          <a class="btn secondary" href="./index.html#categorias">Voltar</a>
        </div>
      </article>
    </div>
  `;

  const mainImageEl = document.getElementById('main-image');
  const mainTrigger = document.getElementById('main-image-trigger');
  const thumbButtons = Array.from(root.querySelectorAll('.thumbs button'));
  const prevButton = document.getElementById('carousel-prev');
  const nextButton = document.getElementById('carousel-next');

  ensureLightbox();
  setActiveImage(0);

  thumbButtons.forEach((button) => {
    button.addEventListener('click', () => {
      const index = Number(button.dataset.index || 0);
      setActiveImage(index);
    });
  });

  prevButton?.addEventListener('click', () => setActiveImage(activeImageIndex - 1));
  nextButton?.addEventListener('click', () => setActiveImage(activeImageIndex + 1));
  mainTrigger?.addEventListener('click', () => openLightbox(activeImageIndex));

  if (mainImageEl) {
    mainImageEl.addEventListener('click', () => openLightbox(activeImageIndex));
  }
}

async function loadRelatedProducts(currentProductId) {
  if (!relatedRoot) return;

  const { data, error } = await supabase
    .from('products')
    .select('id,title,description,category,hotmart_url,price,promo_price,promo_start,promo_end,published_at,status,featured,images')
    .eq('status', 'published')
    .neq('id', currentProductId)
    .order('featured', { ascending: false })
    .order('published_at', { ascending: false })
    .limit(8);

  if (error) {
    relatedRoot.innerHTML = `<div class="empty-state">Erro ao carregar materiais relacionados: ${safeText(error.message)}</div>`;
    return;
  }

  if (!data || !data.length) {
    relatedRoot.innerHTML = '<div class="empty-state">Ainda não há outros materiais publicados.</div>';
    return;
  }

  relatedRoot.innerHTML = data
    .map((product, index) => renderProductCard(product, index, { detailsHref: `./product.html?id=${encodeURIComponent(product.id)}` }))
    .join('');
}

function scrollRelated(direction) {
  if (!relatedRoot) return;
  const amount = Math.max(relatedRoot.clientWidth, 280);
  relatedRoot.scrollBy({ left: direction * amount, behavior: 'smooth' });
}

relatedPrevButton?.addEventListener('click', () => scrollRelated(-1));
relatedNextButton?.addEventListener('click', () => scrollRelated(1));

function formatPublished(dateValue) {
  if (!dateValue) return 'Sem data';
  const date = new Date(`${dateValue}T00:00:00`);
  if (Number.isNaN(date.getTime())) return 'Sem data';
  return date.toLocaleDateString('pt-BR');
}

async function loadProduct() {
  const id = getQueryId();
  if (!id) {
    root.innerHTML = '<div class="empty-state">Produto não informado na URL.</div>';
    return;
  }

  const { data, error } = await supabase
    .from('products')
    .select('id,title,description,category,hotmart_url,price,promo_price,promo_start,promo_end,published_at,status,featured,images')
    .eq('id', id)
    .eq('status', 'published')
    .maybeSingle();

  if (error) {
    root.innerHTML = `<div class="empty-state">Erro ao carregar produto: ${safeText(error.message)}</div>`;
    return;
  }

  if (!data) {
    root.innerHTML = '<div class="empty-state">Produto não encontrado ou ainda não publicado.</div>';
    return;
  }

  document.title = `Papelê Educa - ${data.title}`;
  renderProduct(data);
  await loadRelatedProducts(data.id);
}

loadProduct();
