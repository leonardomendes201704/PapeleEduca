import { supabase } from './supabase-client.js';

const root = document.getElementById('product-root');
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
  if (product.featured) return 'Destaque';
  if (isPromoActive(product)) return 'Oferta';
  return 'Material disponível';
}

function getQueryId() {
  const params = new URLSearchParams(window.location.search);
  return params.get('id');
}

function renderProduct(product) {
  const images = normalizeImages(product.images);
  const mainImage = images[0]?.url || './images/hero.png';
  const title = safeText(product.title);
  const category = safeText(product.category || 'Sem categoria');
  const description = safeText(product.description || 'Material disponível para uso pedagógico.');
  const currentPrice = isPromoActive(product) && product.promo_price ? product.promo_price : product.price;
  const promoPrice = product.promo_price ? currency.format(Number(product.promo_price)) : '';
  const price = currency.format(Number(currentPrice || 0));
  const buyUrl = typeof product.hotmart_url === 'string' ? product.hotmart_url.trim() : '';
  const thumbs = images.length
    ? images.map((image, index) => `
      <button type="button" class="${index === 0 ? 'active' : ''}" data-image="${image.url}">
        <img src="${image.url}" alt="${title} - imagem ${index + 1}" />
      </button>
    `).join('')
    : '';

  root.innerHTML = `
    <div class="detail-grid">
      <div class="gallery">
        <div class="main-image">
          <img id="main-image" src="${mainImage}" alt="${title}" />
        </div>
        <div class="thumbs">
          ${thumbs}
        </div>
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
          <li>Download e acesso conforme configurado no produto da Hotmart.</li>
          <li>Produto cadastrado e publicado diretamente pelo painel admin.</li>
          <li>Sem carrinho, sem checkout próprio e sem fluxo de compra interno.</li>
        </ul>

        <div class="actions">
          ${buyUrl
            ? `<a class="btn buy-now" href="${buyUrl}" target="_blank" rel="noopener noreferrer">Comprar agora</a>`
            : `<span class="btn buy-now" style="opacity:.7; pointer-events:none;">Comprar agora</span>`}
          <a class="btn secondary" href="./index.html#categorias">Voltar</a>
        </div>
      </article>
    </div>

    <section class="section">
      <h2>Detalhes do material</h2>
      <div class="detail-cards">
        <article class="info-card">
          <strong>Categoria</strong>
          <div>${category}</div>
        </article>
        <article class="info-card">
          <strong>Preço</strong>
          <div>${price}</div>
        </article>
        <article class="info-card">
          <strong>Entrega</strong>
          <div>Compra finalizada no Hotmart.</div>
        </article>
      </div>
    </section>
  `;

  const mainImageEl = document.getElementById('main-image');
  const thumbButtons = Array.from(root.querySelectorAll('.thumbs button'));
  thumbButtons.forEach((button) => {
    button.addEventListener('click', () => {
      const url = button.dataset.image;
      if (url && mainImageEl) {
        mainImageEl.src = url;
        thumbButtons.forEach((item) => item.classList.remove('active'));
        button.classList.add('active');
      }
    });
  });
}

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
}

loadProduct();
