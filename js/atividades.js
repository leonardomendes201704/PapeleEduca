import { supabase } from './supabase-client.js';
import { renderProductCard, safeText } from './product-card.js';
import { bindProductCardTracking } from './metrics.js';

const grid = document.getElementById('activities-grid');
const pagination = document.getElementById('activities-pagination');
const resultsCount = document.getElementById('results-count');
const pageSummary = document.getElementById('page-summary');
const PER_PAGE = 12;

function getCurrentPage() {
  const params = new URLSearchParams(window.location.search);
  const value = Number.parseInt(params.get('page') || '1', 10);
  return Number.isFinite(value) && value > 0 ? value : 1;
}

function setPageInUrl(page) {
  const url = new URL(window.location.href);
  url.searchParams.set('page', String(page));
  window.history.pushState({ page }, '', url);
}

function renderPagination(currentPage, totalPages) {
  if (!pagination) return;

  if (totalPages <= 1) {
    pagination.innerHTML = '';
    return;
  }

  const buttons = [];
  const pushButton = (label, page, { active = false, disabled = false, ariaLabel = '' } = {}) => {
    buttons.push(`
      <button
        type="button"
        class="page-btn ${active ? 'active' : ''}"
        data-page="${page}"
        ${disabled ? 'disabled' : ''}
        ${ariaLabel ? `aria-label="${ariaLabel}"` : ''}
      >${label}</button>
    `);
  };

  pushButton('Anterior', currentPage - 1, {
    disabled: currentPage <= 1,
    ariaLabel: 'Ir para a página anterior',
  });

  const visiblePages = new Set([1, totalPages, currentPage - 1, currentPage, currentPage + 1]);
  const pages = Array.from({ length: totalPages }, (_, index) => index + 1)
    .filter((page) => visiblePages.has(page) || (page <= 2 && currentPage <= 4) || (page >= totalPages - 1 && currentPage >= totalPages - 3))
    .filter((page, index, arr) => index === 0 || page - arr[index - 1] <= 2);

  let lastPage = 0;
  pages.forEach((page) => {
    if (page - lastPage > 1) {
      buttons.push('<span class="page-btn" aria-hidden="true" style="cursor:default;opacity:.55;">…</span>');
    }
    pushButton(String(page), page, {
      active: page === currentPage,
      ariaLabel: `Ir para a página ${page}`,
    });
    lastPage = page;
  });

  pushButton('Próxima', currentPage + 1, {
    disabled: currentPage >= totalPages,
    ariaLabel: 'Ir para a próxima página',
  });

  pagination.innerHTML = buttons.join('');
  pagination.querySelectorAll('[data-page]').forEach((button) => {
    button.addEventListener('click', () => {
      const targetPage = Number(button.dataset.page || '1');
      void loadActivities(targetPage, true);
    });
  });
}

async function loadActivities(page = getCurrentPage(), updateUrl = false) {
  const currentPage = Number.isFinite(page) && page > 0 ? page : 1;
  const from = (currentPage - 1) * PER_PAGE;
  const to = from + PER_PAGE - 1;

  if (updateUrl) {
    setPageInUrl(currentPage);
  }

  if (grid) {
    grid.innerHTML = '<div class="empty-state">Carregando atividades...</div>';
  }

  const { data, error, count } = await supabase
    .from('products')
    .select('id,title,description,category,hotmart_url,price,promo_price,promo_start,promo_end,published_at,status,featured,images', { count: 'exact' })
    .eq('status', 'published')
    .order('featured', { ascending: false })
    .order('published_at', { ascending: false })
    .range(from, to);

  if (error) {
    if (grid) {
      grid.innerHTML = `<div class="empty-state">Erro ao carregar atividades: ${safeText(error.message)}</div>`;
    }
    if (pagination) pagination.innerHTML = '';
    return;
  }

  const totalItems = count || 0;
  const totalPages = totalItems > 0 ? Math.ceil(totalItems / PER_PAGE) : 1;
  const normalizedPage = Math.min(currentPage, totalPages);

  if (normalizedPage !== currentPage) {
    await loadActivities(normalizedPage, true);
    return;
  }

  if (resultsCount) {
    resultsCount.textContent = `${totalItems} atividade${totalItems === 1 ? '' : 's'} encontrada${totalItems === 1 ? '' : 's'}`;
  }

  if (pageSummary) {
    pageSummary.textContent = `Página ${normalizedPage} de ${totalPages}`;
  }

  if (!data || !data.length) {
    if (grid) {
      grid.innerHTML = '<div class="empty-state">Nenhuma atividade publicada ainda.</div>';
    }
    renderPagination(normalizedPage, totalPages);
    return;
  }

  if (grid) {
    grid.innerHTML = data
      .map((product, index) => renderProductCard(product, index, {
        detailsHref: `./product.html?id=${encodeURIComponent(product.id)}`,
      }))
      .join('');
    bindProductCardTracking(grid, 'all_activities');
  }

  renderPagination(normalizedPage, totalPages);
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

window.addEventListener('popstate', () => {
  const page = getCurrentPage();
  void loadActivities(page, false);
});

loadActivities();
