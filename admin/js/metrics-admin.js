import { supabase } from './supabase-client.js';

function formatPercent(value) {
  return `${Math.round(value * 100)}%`;
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

function firstImage(images) {
  if (!Array.isArray(images) || !images.length) return '../images/hero.png';
  const first = images[0];
  if (typeof first === 'string') return first;
  return first?.url || '../images/hero.png';
}

const heroViewsEl = document.getElementById('metric-hero-views');
const heroDownloadsEl = document.getElementById('metric-hero-downloads');
const heroBuyClicksEl = document.getElementById('metric-hero-buy-clicks');
const heroRateEl = document.getElementById('metric-hero-rate');
const heroBlogListingEl = document.getElementById('metric-hero-blog-listing');
const heroBlogViewsEl = document.getElementById('metric-hero-blog-views');
const heroBlogFacebookEl = document.getElementById('metric-hero-blog-facebook');
const heroBlogReadsEl = document.getElementById('metric-hero-blog-reads');
const heroBlogRateEl = document.getElementById('metric-hero-blog-rate');
const metricsListEl = document.getElementById('metrics-list');
const freeMetricsListEl = document.getElementById('free-metrics-list');
const blogMetricsListEl = document.getElementById('blog-metrics-list');

function renderProductTable(rows) {
  if (!rows.length) {
    return '<p class="metric-empty">Ainda não há eventos registrados.</p>';
  }

  const topRows = rows.slice(0, 5);
  return `
    <div class="corp-table-wrap">
      <table class="corp-table">
        <thead>
          <tr>
            <th scope="col" class="col-rank">#</th>
            <th scope="col" class="col-product">Produto</th>
            <th scope="col" class="col-metric">Vis.</th>
            <th scope="col" class="col-metric">FB</th>
            <th scope="col" class="col-metric">Abert.</th>
            <th scope="col" class="col-metric">Compras</th>
          </tr>
        </thead>
        <tbody>
          ${topRows.map((item, index) => `
            <tr>
              <td class="col-rank"><span class="rank-badge">${index + 1}</span></td>
              <td class="col-product">
                <div class="corp-product">
                  <img src="${escapeHtml(firstImage(item.images))}" alt="" loading="lazy" />
                  <div class="corp-product-copy">
                    <span class="corp-product-name" title="${escapeHtml(item.title)}">${escapeHtml(item.title)}</span>
                    <span class="corp-product-meta">${escapeHtml(item.category || 'Sem categoria')}</span>
                  </div>
                </div>
              </td>
              <td class="col-metric">${item.views || 0}</td>
              <td class="col-metric">${item.facebook_views || 0}</td>
              <td class="col-metric">${item.opens || 0}</td>
              <td class="col-metric col-metric--accent">${item.buy_clicks || 0}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;
}

function renderFreeTable(rows, coverMap = {}) {
  if (!rows.length) {
    return '<p class="metric-empty">Ainda não há downloads registrados.</p>';
  }

  const topRows = rows.slice(0, 5);
  return `
    <div class="corp-table-wrap">
      <table class="corp-table corp-table--free">
        <thead>
          <tr>
            <th scope="col" class="col-rank">#</th>
            <th scope="col" class="col-product">Material</th>
            <th scope="col" class="col-metric">Downloads</th>
          </tr>
        </thead>
        <tbody>
          ${topRows.map((item, index) => {
            const cover = coverMap[item.id] || '../images/hero.png';
            return `
              <tr>
                <td class="col-rank"><span class="rank-badge">${index + 1}</span></td>
                <td class="col-product">
                  <div class="corp-product">
                    <img src="${escapeHtml(cover)}" alt="" loading="lazy" />
                    <div class="corp-product-copy">
                      <span class="corp-product-name" title="${escapeHtml(item.title)}">${escapeHtml(item.title)}</span>
                      <span class="corp-product-meta">${escapeHtml(item.category || 'Sem categoria')}</span>
                    </div>
                  </div>
                </td>
                <td class="col-metric col-metric--accent">${item.downloads || 0}</td>
              </tr>
            `;
          }).join('')}
        </tbody>
      </table>
    </div>
  `;
}

async function loadProductMetrics() {
  if (!metricsListEl) return { views: 0, buyClicks: 0 };

  const { data, error } = await supabase
    .from('product_metrics_report')
    .select('id,title,category,status,views,facebook_views,unique_views,opens,buy_clicks,last_event_at,images')
    .order('views', { ascending: false })
    .order('buy_clicks', { ascending: false });

  if (error) {
    metricsListEl.innerHTML = `<p class="metric-empty">Erro ao carregar métricas: ${escapeHtml(error.message)}</p>`;
    return { views: 0, buyClicks: 0 };
  }

  const rows = data || [];
  const totals = rows.reduce((acc, item) => {
    acc.views += Number(item.views || 0);
    acc.buyClicks += Number(item.buy_clicks || 0);
    return acc;
  }, { views: 0, buyClicks: 0 });

  metricsListEl.innerHTML = renderProductTable(rows);
  return totals;
}

async function loadFreeMaterialMetrics() {
  if (!freeMetricsListEl) return { downloads: 0 };

  const [metricsRes, materialsRes] = await Promise.all([
    supabase
      .from('free_material_metrics_report')
      .select('id,title,category,file_type,status,views,unique_views,downloads,last_event_at')
      .order('downloads', { ascending: false })
      .order('views', { ascending: false }),
    supabase.from('free_materials').select('id,cover_url'),
  ]);

  if (metricsRes.error) {
    freeMetricsListEl.innerHTML = `<p class="metric-empty">Erro ao carregar métricas: ${escapeHtml(metricsRes.error.message)}</p>`;
    return { downloads: 0 };
  }

  const coverMap = Object.fromEntries(
    (materialsRes.data || []).map((item) => [item.id, item.cover_url || '']),
  );

  const rows = (metricsRes.data || []).filter(
    (item) => Number(item.views || 0) > 0 || Number(item.downloads || 0) > 0,
  );
  const totals = rows.reduce((acc, item) => {
    acc.downloads += Number(item.downloads || 0);
    return acc;
  }, { downloads: 0 });

  freeMetricsListEl.innerHTML = renderFreeTable(rows, coverMap);
  return totals;
}

function renderBlogTable(rows) {
  if (!rows.length) {
    return '<p class="metric-empty">Ainda não há visualizações do blog.</p>';
  }

  const topRows = rows.slice(0, 5);
  return `
    <div class="corp-table-wrap">
      <table class="corp-table">
        <thead>
          <tr>
            <th scope="col" class="col-rank">#</th>
            <th scope="col" class="col-product">Post</th>
            <th scope="col" class="col-metric">Views</th>
            <th scope="col" class="col-metric">FB</th>
            <th scope="col" class="col-metric">Leituras</th>
            <th scope="col" class="col-metric">Taxa</th>
          </tr>
        </thead>
        <tbody>
          ${topRows.map((item, index) => `
            <tr>
              <td class="col-rank"><span class="rank-badge">${index + 1}</span></td>
              <td class="col-product">
                <div class="corp-product">
                  <img src="${escapeHtml(item.cover_url || '../images/hero.png')}" alt="" loading="lazy" />
                  <div class="corp-product-copy">
                    <span class="corp-product-name" title="${escapeHtml(item.title)}">${escapeHtml(item.title)}</span>
                    <span class="corp-product-meta">${escapeHtml(item.category || 'Sem categoria')}</span>
                  </div>
                </div>
              </td>
              <td class="col-metric">${item.views || 0}</td>
              <td class="col-metric">${item.facebook_views || 0}</td>
              <td class="col-metric">${item.read_completes || 0}</td>
              <td class="col-metric col-metric--accent">${formatPercent(Number(item.read_rate || 0) / 100)}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;
}

async function loadBlogPostMetrics() {
  if (!blogMetricsListEl) {
    return { listingViews: 0, views: 0, reads: 0, facebookViews: 0 };
  }

  const [metricsRes, listingRes] = await Promise.all([
    supabase
      .from('blog_post_metrics_report')
      .select('id,title,slug,status,cover_url,category,views,facebook_views,read_completes,read_rate,last_event_at')
      .order('views', { ascending: false })
      .order('read_completes', { ascending: false }),
    supabase.from('blog_listing_metrics_report').select('views').maybeSingle(),
  ]);

  const listingViews = Number(listingRes.data?.views || 0);
  const listingEl = document.getElementById('blog-listing-views-value');
  if (listingEl) listingEl.textContent = listingViews;

  if (metricsRes.error) {
    blogMetricsListEl.innerHTML = `<p class="metric-empty">Erro ao carregar métricas: ${escapeHtml(metricsRes.error.message)}</p>`;
    return { listingViews, views: 0, reads: 0, facebookViews: 0 };
  }

  const allRows = metricsRes.data || [];
  const totals = allRows.reduce((acc, item) => {
    acc.views += Number(item.views || 0);
    acc.reads += Number(item.read_completes || 0);
    acc.facebookViews += Number(item.facebook_views || 0);
    return acc;
  }, { views: 0, reads: 0, facebookViews: 0 });

  const rows = allRows.filter(
    (item) => Number(item.views || 0) > 0 || Number(item.read_completes || 0) > 0,
  );
  blogMetricsListEl.innerHTML = renderBlogTable(rows);
  return {
    listingViews,
    views: totals.views,
    reads: totals.reads,
    facebookViews: totals.facebookViews,
  };
}

function updateHeroKpis(productTotals, freeTotals, blogTotals = {}) {
  const views = productTotals.views;
  const buyClicks = productTotals.buyClicks;
  const downloads = freeTotals.downloads;
  const rate = views > 0 ? buyClicks / views : 0;
  const blogViews = Number(blogTotals.views || 0);
  const blogReads = Number(blogTotals.reads || 0);
  const blogRate = blogViews > 0 ? blogReads / blogViews : 0;

  if (heroViewsEl) heroViewsEl.textContent = views;
  if (heroDownloadsEl) heroDownloadsEl.textContent = downloads;
  if (heroBuyClicksEl) heroBuyClicksEl.textContent = buyClicks;
  if (heroRateEl) heroRateEl.textContent = formatPercent(rate);
  if (heroBlogListingEl) heroBlogListingEl.textContent = Number(blogTotals.listingViews || 0);
  if (heroBlogViewsEl) heroBlogViewsEl.textContent = blogViews;
  if (heroBlogFacebookEl) heroBlogFacebookEl.textContent = Number(blogTotals.facebookViews || 0);
  if (heroBlogReadsEl) heroBlogReadsEl.textContent = blogReads;
  if (heroBlogRateEl) heroBlogRateEl.textContent = formatPercent(blogRate);
}

export async function initMetrics() {
  const [productTotals, freeTotals, blogTotals] = await Promise.all([
    loadProductMetrics(),
    loadFreeMaterialMetrics(),
    loadBlogPostMetrics(),
  ]);
  updateHeroKpis(productTotals, freeTotals, blogTotals);
}

export async function refreshMetrics() {
  await initMetrics();
}
