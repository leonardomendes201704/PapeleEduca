import { supabase } from './supabase-client.js';

function formatPercent(value) {
  return `${Math.round(value * 100)}%`;
}

const metricViewsEl = document.getElementById('metric-views');
const metricUniqueViewsEl = document.getElementById('metric-unique-views');
const metricOpensEl = document.getElementById('metric-opens');
const metricBuyClicksEl = document.getElementById('metric-buy-clicks');
const metricConversionEl = document.getElementById('metric-conversion');
const metricsListEl = document.getElementById('metrics-list');
const freeMetricViewsEl = document.getElementById('free-metric-views');
const freeMetricUniqueViewsEl = document.getElementById('free-metric-unique-views');
const freeMetricDownloadsEl = document.getElementById('free-metric-downloads');
const freeMetricConversionEl = document.getElementById('free-metric-conversion');
const freeMetricsListEl = document.getElementById('free-metrics-list');

async function loadProductMetrics() {
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

  metricsListEl.innerHTML = `
    <div class="metric-row head">
      <div>Produto</div>
      <div class="metric-value">Vis.</div>
      <div class="metric-value">Abert.</div>
      <div class="metric-value">Compras</div>
      <div class="metric-value">Conv.</div>
      <div>Último evento</div>
    </div>
    ${rows.map((item) => {
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

async function loadFreeMaterialMetrics() {
  if (!freeMetricsListEl) return;

  const { data, error } = await supabase
    .from('free_material_metrics_report')
    .select('id,title,category,file_type,status,views,unique_views,downloads,last_event_at')
    .order('downloads', { ascending: false })
    .order('views', { ascending: false });

  if (error) {
    freeMetricsListEl.innerHTML = `<p class="metric-empty">Erro ao carregar métricas: ${error.message}</p>`;
    return;
  }

  const rows = (data || []).filter((item) => Number(item.views || 0) > 0 || Number(item.downloads || 0) > 0);
  const totals = rows.reduce((acc, item) => {
    acc.views += Number(item.views || 0);
    acc.uniqueViews += Number(item.unique_views || 0);
    acc.downloads += Number(item.downloads || 0);
    return acc;
  }, { views: 0, uniqueViews: 0, downloads: 0 });

  if (freeMetricViewsEl) freeMetricViewsEl.textContent = totals.views;
  if (freeMetricUniqueViewsEl) freeMetricUniqueViewsEl.textContent = totals.uniqueViews;
  if (freeMetricDownloadsEl) freeMetricDownloadsEl.textContent = totals.downloads;
  if (freeMetricConversionEl) {
    const rate = totals.views > 0 ? totals.downloads / totals.views : 0;
    freeMetricConversionEl.textContent = formatPercent(rate);
  }

  if (!rows.length) {
    freeMetricsListEl.innerHTML = '<p class="metric-empty">Ainda não há visualizações ou downloads registrados.</p>';
    return;
  }

  freeMetricsListEl.innerHTML = `
    <div class="metric-row head free-metric-row">
      <div>Material</div>
      <div class="metric-value">Vis.</div>
      <div class="metric-value">Únicas</div>
      <div class="metric-value">Downloads</div>
      <div class="metric-value">Taxa</div>
      <div>Último evento</div>
    </div>
    ${rows.map((item) => {
      const rate = item.views > 0 ? Number(item.downloads || 0) / Number(item.views || 1) : 0;
      const lastEvent = item.last_event_at
        ? new Date(item.last_event_at).toLocaleString('pt-BR')
        : 'Sem dados';
      return `
        <div class="metric-row free-metric-row">
          <div>
            <div class="metric-product">${item.title}</div>
            <div class="muted">${item.category || 'Sem categoria'} • ${item.file_type || 'Arquivo'}</div>
          </div>
          <div class="metric-value">${item.views || 0}</div>
          <div class="metric-value">${item.unique_views || 0}</div>
          <div class="metric-value">${item.downloads || 0}</div>
          <div class="metric-value metric-rate">${formatPercent(rate)}</div>
          <div class="muted">${lastEvent}</div>
        </div>
      `;
    }).join('')}
  `;
}

export async function initMetrics() {
  await Promise.all([loadProductMetrics(), loadFreeMaterialMetrics()]);
}

export async function refreshMetrics() {
  await initMetrics();
}
