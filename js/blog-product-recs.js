import { supabase } from './supabase-client.js';
import { renderProductCard } from './product-card.js';
import { bindProductCardTracking } from './metrics.js';

const CARD_OPTIONS = {
  imageFallback: '/images/hero.png',
};

function shuffle(list) {
  const items = [...list];
  for (let i = items.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [items[i], items[j]] = [items[j], items[i]];
  }
  return items;
}

function createRecsSection(placement) {
  const section = document.createElement('section');
  section.className = 'blog-product-recs';
  section.dataset.blogProducts = placement;
  section.setAttribute('aria-label', 'Materiais recomendados');
  section.innerHTML = `
    <div class="blog-product-recs-head">
      <p class="blog-product-recs-eyebrow">Catálogo Papelê Educa</p>
      <h2>${placement === 'mid' ? 'Materiais para continuar explorando' : 'Mais materiais para a sua prática'}</h2>
      <p>Uma seleção aleatória do nosso catálogo.</p>
    </div>
    <div class="products blog-product-recs-grid" aria-live="polite"></div>
  `;
  return section;
}

function mountSections(contentEl) {
  const mid = createRecsSection('mid');
  const end = createRecsSection('end');
  const blocks = [...contentEl.children];

  if (blocks.length >= 2) {
    const insertBefore = blocks[Math.floor(blocks.length / 2)];
    contentEl.insertBefore(mid, insertBefore);
  } else {
    contentEl.appendChild(mid);
  }

  contentEl.after(end);
  return { mid, end };
}

function fillGrid(section, products, source) {
  const grid = section.querySelector('.blog-product-recs-grid');
  if (!grid) return;
  if (!products.length) {
    section.hidden = true;
    return;
  }

  grid.innerHTML = products
    .map((product, index) => renderProductCard(product, index, {
      ...CARD_OPTIONS,
      detailsHref: `/product.html?id=${encodeURIComponent(product.id)}`,
    }))
    .join('');
  bindProductCardTracking(grid, source);
}

async function loadRandomProducts(count) {
  const { data, error } = await supabase
    .from('products')
    .select('id,title,description,category,hotmart_url,price,promo_price,promo_start,promo_end,published_at,status,featured,images')
    .eq('status', 'published')
    .limit(48);

  if (error || !data?.length) return [];
  return shuffle(data).slice(0, count);
}

async function boot() {
  const content = document.querySelector('.article-content');
  if (!content || !document.querySelector('[data-blog-post-id]')) return;

  const { mid, end } = mountSections(content);
  const products = await loadRandomProducts(6);

  if (!products.length) {
    mid.remove();
    end.remove();
    return;
  }

  const midProducts = products.slice(0, 3);
  const endProducts = products.length >= 6
    ? products.slice(3, 6)
    : shuffle(products).slice(0, Math.min(3, products.length));

  fillGrid(mid, midProducts, 'blog_mid');
  fillGrid(end, endProducts, 'blog_end');
}

void boot();
