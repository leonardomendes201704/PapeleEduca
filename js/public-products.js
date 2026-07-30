import { supabase } from './supabase-client.js';
import { renderProductCard, safeText } from './product-card.js';
import { bindProductCardTracking, trackHomeViewOnce } from './metrics.js';

const grid = document.getElementById('products-grid');
const categoriesGrid = document.getElementById('categories-grid');

async function loadProducts() {
  const { data, error } = await supabase
    .from('products')
    .select('id,title,description,category,subcategory,hotmart_url,price,promo_price,promo_start,promo_end,published_at,status,featured,images')
    .eq('status', 'published')
    .order('featured', { ascending: false })
    .order('published_at', { ascending: false })
    .limit(9);

  if (error) {
    grid.innerHTML = `<article class="product"><h3>Erro ao carregar produtos</h3><p>${safeText(error.message)}</p></article>`;
    if (categoriesGrid) {
      categoriesGrid.innerHTML = `<article class="product"><h3>Erro ao carregar produtos</h3><p>${safeText(error.message)}</p></article>`;
    }
    return;
  }

  if (!data || !data.length) {
    grid.innerHTML = `<article class="product"><h3>Nenhum produto publicado ainda</h3><p>Cadastre um produto no painel admin e publique para aparecer aqui.</p></article>`;
    if (categoriesGrid) {
      categoriesGrid.innerHTML = `<article class="product"><h3>Nenhum produto publicado ainda</h3><p>Cadastre um produto no painel admin e publique para aparecer aqui.</p></article>`;
    }
    return;
  }

  const categoriesData = data.slice(0, 6);
  const featuredData = data.slice(0, 3);

  if (categoriesGrid) {
    categoriesGrid.innerHTML = categoriesData
      .map((product, index) => renderProductCard(product, index, { detailsHref: `./product.html?id=${encodeURIComponent(product.id)}` }))
      .join('');
    bindProductCardTracking(categoriesGrid, 'categories');
  }

  grid.innerHTML = featuredData
    .map((product, index) => renderProductCard(product, index, { detailsHref: `./product.html?id=${encodeURIComponent(product.id)}` }))
    .join('');
  bindProductCardTracking(grid, 'featured');
}

void trackHomeViewOnce({ page_context: 'home' });
loadProducts();
