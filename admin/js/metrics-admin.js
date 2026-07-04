import { supabase } from './supabase-client.js';

function formatPercent(value) {
  return `${Math.round(value * 100)}%`;
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
const metricsListEl = document.getElementById('metrics-list');
const freeMetricsListEl = document.getElementById('free-metrics-list');

function renderProductTable(rows) {
  if (!rows.length) {
    return '<p class="metric-empty">Ainda não há eventos registrados.</p>';
  }

  const topRows = rows.slice(0, 5);
  return `
    <div class="ranking-row head">
      <div>#</div>
      <div>Produto</div>
      <div class="ranking-num">Vis.</div>
      <div class="ranking-num">Abert.</div>
      <div class="ranking-num">Compras</div>
    </div>
    ${topRows.map((item, index) => `
      <div class="ranking-row">
        <div class="ranking-rank">${index + 1}</div>
        <div class="ranking-product">
          <img src="${firstImage(item.images)}" alt="" />
          <div>
            <div class="ranking-name">${item.title}</div>
            <div class="muted">${item.category || 'Sem categoria'}</div>
          </div>
        </div>
        <div class="ranking-num">${item.views || 0}</div>
        <div class="ranking-num">${item.opens || 0}</div>
        <div class="ranking-num ranking-highlight">${item.buy_clicks || 0}</div>
      </div>
    `).join('')}
  `;
}

function renderFreeTable(rows) {
  if (!rows.length) {
    return '<p class="metric-empty">Ainda não há downloads registrados.</p>';
  }

  const topRows = rows.slice(0, 5);
  return `
    <div class="ranking-row head ranking-row--free">
      <div>#</div>
      <div>Material</div>
      <div class="ranking-num">Downloads</div>
    </div>
    ${topRows.map((item, index) => `
      <div class="ranking-row ranking-row--free">
        <div class="ranking-rank">${index + 1}</div>
        <div class="ranking-product">
          <img src="${item.cover_url || '../images/hero.png'}" alt="" />
          <div>
            <div class="ranking-name">${item.title}</div>
            <div class="muted">${item.category || 'Sem categoria'}</div>
          </div>
        </div>
        <div class="ranking-num ranking-highlight">${item.downloads || 0}</div>
      </div>
    `).join('')}
  `;
}

async function loadProductMetrics() {
  if (!metricsListEl) return { views: 0, buyClicks: 0 };

  const { data, error } = await supabase
    .from('product_metrics_report')
    .select('id,title,category,status,views,unique_views,opens,buy_clicks,last_event_at,images')
    .order('views', { ascending: false })
    .order('buy_clicks', { ascending: false });

  if (error) {
    metricsListEl.innerHTML = `<p class="metric-empty">Erro ao carregar métricas: ${error.message}</p>`;
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

  const { data, error } = await supabase
    .from('free_material_metrics_report')
    .select('id,title,category,file_type,status,views,unique_views,downloads,last_event_at,cover_url')
    .order('downloads', { ascending: false })
    .order('views', { ascending: false });

  if (error) {
    freeMetricsListEl.innerHTML = `<p class="metric-empty">Erro ao carregar métricas: ${error.message}</p>`;
    return { downloads: 0 };
  }

  const rows = (data || []).filter((item) => Number(item.views || 0) > 0 || Number(item.downloads || 0) > 0);
  const totals = rows.reduce((acc, item) => {
    acc.downloads += Number(item.downloads || 0);
    return acc;
  }, { downloads: 0 });

  freeMetricsListEl.innerHTML = renderFreeTable(rows);
  return totals;
}

function updateHeroKpis(productTotals, freeTotals) {
  const views = productTotals.views;
  const buyClicks = productTotals.buyClicks;
  const downloads = freeTotals.downloads;
  const rate = views > 0 ? buyClicks / views : 0;

  if (heroViewsEl) heroViewsEl.textContent = views;
  if (heroDownloadsEl) heroDownloadsEl.textContent = downloads;
  if (heroBuyClicksEl) heroBuyClicksEl.textContent = buyClicks;
  if (heroRateEl) heroRateEl.textContent = formatPercent(rate);
}

export async function initMetrics() {
  const [productTotals, freeTotals] = await Promise.all([
    loadProductMetrics(),
    loadFreeMaterialMetrics(),
  ]);
  updateHeroKpis(productTotals, freeTotals);
}

export async function refreshMetrics() {
  await initMetrics();
}
