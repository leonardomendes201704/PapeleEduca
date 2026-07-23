import { supabase } from './supabase-client.js';
import { BLOG_IMAGES_BUCKET } from './config.js';
import {
  initBlogEditor,
  setEditorContent,
  getEditorHtml,
  getEditorJson,
  insertEditorImage,
} from './blog-editor.js';
import { initBlogSettings } from './blog-admin.js';
import { showBusyOverlay, hideBusyOverlay, showResultModal } from './admin-feedback.js';

const STATUS_LABELS = {
  draft: 'Rascunho',
  published: 'Publicado',
  scheduled: 'Agendado',
  archived: 'Arquivado',
};

let bound = false;
let posts = [];
let postMetricsById = {};
let categories = [];
let tags = [];
let mediaItems = [];
let slugManual = false;
let pendingCover = null;
let pendingOg = null;
let facebookModalPost = null;
let facebookDeleteModalPost = null;
let postsSort = { key: '', dir: 'asc' };
let blogMetricsChart = null;
let chartJsPromise = null;

const POST_SORT_KEYS = {
  title: (p) => String(p.title || '').toLowerCase(),
  status: (p) => String(STATUS_LABELS[p.status] || p.status || '').toLowerCase(),
  category: (p) => String(p.blog_categories?.name || '').toLowerCase(),
  views: (p) => Number(postMetricsById[p.id]?.views || 0),
  facebook: (p) => Number(postMetricsById[p.id]?.facebook_views || 0),
  reads: (p) => Number(postMetricsById[p.id]?.read_completes || 0),
  rate: (p) => Number(postMetricsById[p.id]?.read_rate || 0),
  published_at: (p) => {
    const t = p.published_at ? Date.parse(p.published_at) : NaN;
    return Number.isFinite(t) ? t : 0;
  },
};

function sortPosts(list) {
  if (!postsSort.key || !POST_SORT_KEYS[postsSort.key]) return list;
  const getter = POST_SORT_KEYS[postsSort.key];
  const dir = postsSort.dir === 'desc' ? -1 : 1;
  return [...list].sort((a, b) => {
    const va = getter(a);
    const vb = getter(b);
    if (typeof va === 'number' && typeof vb === 'number') {
      return (va - vb) * dir;
    }
    return String(va).localeCompare(String(vb), 'pt-BR', { sensitivity: 'base' }) * dir;
  });
}

function sortAria(key) {
  if (postsSort.key !== key) return '';
  return ` aria-sort="${postsSort.dir === 'desc' ? 'descending' : 'ascending'}"`;
}

function bindPostsSortHeaders(list) {
  list.querySelectorAll('th.sortable[data-sort]').forEach((th) => {
    th.tabIndex = 0;
    const activate = () => {
      const key = th.dataset.sort;
      if (postsSort.key === key) {
        postsSort.dir = postsSort.dir === 'asc' ? 'desc' : 'asc';
      } else {
        postsSort = { key, dir: key === 'title' || key === 'status' || key === 'category' ? 'asc' : 'desc' };
      }
      renderPosts();
    };
    th.addEventListener('click', activate);
    th.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        activate();
      }
    });
  });
}

function blogPublicUrl(slug) {
  const origin = window.location.origin || 'https://papele-educa.vercel.app';
  return `${origin.replace(/\/$/, '')}/blog/${encodeURIComponent(slug)}`;
}

/** Opens the public post without counting views/reads (see blog-metrics.js ?preview=1). */
function blogPreviewUrl(slug) {
  const url = new URL(blogPublicUrl(slug));
  url.searchParams.set('preview', '1');
  return url.toString();
}

function blogFacebookShareUrl(slug) {
  const url = new URL(blogPublicUrl(slug));
  url.searchParams.set('utm_source', 'facebook');
  url.searchParams.set('utm_medium', 'social');
  url.searchParams.set('utm_campaign', 'blog');
  url.searchParams.set('utm_content', String(slug || ''));
  return url.toString();
}

function defaultFacebookMessage(post) {
  const title = String(post?.title || '').trim();
  const excerpt = String(post?.excerpt || post?.seo_description || '').trim();
  if (excerpt) return `${title}\n\n${excerpt}`;
  return title;
}

function formatRate(value) {
  const n = Number(value || 0);
  return `${Number.isFinite(n) ? n : 0}%`;
}

function $(id) {
  return document.getElementById(id);
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

function slugify(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 180);
}

function safeName(name) {
  return String(name || 'arquivo').replace(/[^a-zA-Z0-9._-]+/g, '_');
}

function estimateReadingTime(html) {
  const text = String(html || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  const words = text ? text.split(' ').length : 0;
  return Math.max(1, Math.ceil(words / 200));
}

function toLocalInputValue(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function fromLocalInputValue(value) {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function setPreview(el, url) {
  if (!el) return;
  el.innerHTML = url
    ? `<img src="${escapeHtml(url)}" alt="" />`
    : '<span class="muted">Sem imagem</span>';
}

function switchTab(tab) {
  document.querySelectorAll('.blog-tab').forEach((btn) => {
    btn.classList.toggle('is-active', btn.dataset.blogTab === tab);
  });
  document.querySelectorAll('.blog-tab-panel').forEach((panel) => {
    panel.classList.toggle('is-active', panel.dataset.blogPanel === tab);
  });
}

async function uploadBlogFile(file, folder = 'uploads') {
  const path = `${folder}/${crypto.randomUUID()}-${safeName(file.name)}`;
  const { error } = await supabase.storage.from(BLOG_IMAGES_BUCKET).upload(path, file, {
    cacheControl: '3600',
    upsert: false,
    contentType: file.type || undefined,
  });
  if (error) throw error;
  const { data } = supabase.storage.from(BLOG_IMAGES_BUCKET).getPublicUrl(path);
  const url = data.publicUrl;
  await supabase.from('blog_media').insert({
    path,
    url,
    file_name: file.name,
    mime_type: file.type || '',
    size_bytes: file.size || 0,
  });
  return { path, url };
}

async function loadCategories() {
  const { data, error } = await supabase
    .from('blog_categories')
    .select('*')
    .order('sort_order', { ascending: true })
    .order('name', { ascending: true });
  if (error) throw error;
  categories = data || [];
  renderCategories();
  fillCategorySelects();
}

async function loadTags() {
  const { data, error } = await supabase
    .from('blog_tags')
    .select('*')
    .order('name', { ascending: true });
  if (error) throw error;
  tags = data || [];
  renderTags();
}

async function loadPosts() {
  const [postsRes, metricsRes, fbViewsRes] = await Promise.all([
    supabase
      .from('blog_posts')
      .select('*, blog_categories(name, slug), blog_post_tags(tag_id, blog_tags(name, slug))')
      .order('updated_at', { ascending: false }),
    supabase
      .from('blog_post_metrics_report')
      .select('id,views,read_completes,read_rate,facebook_views'),
    supabase
      .from('blog_post_events')
      .select('blog_post_id')
      .eq('event_type', 'view')
      .eq('source', 'facebook'),
  ]);
  if (postsRes.error) throw postsRes.error;
  posts = postsRes.data || [];

  let metricsRows = metricsRes.data || [];
  if (metricsRes.error) {
    // Fallback when facebook_views is not in the view yet (SQL migration pending)
    const fallback = await supabase
      .from('blog_post_metrics_report')
      .select('id,views,read_completes,read_rate');
    if (fallback.error) {
      console.warn('Falha ao carregar métricas do blog:', metricsRes.error.message || fallback.error.message);
      metricsRows = [];
    } else {
      metricsRows = (fallback.data || []).map((row) => ({ ...row, facebook_views: 0 }));
    }
  }

  const fbCounts = {};
  for (const row of fbViewsRes.data || []) {
    const id = row.blog_post_id;
    if (!id) continue;
    fbCounts[id] = (fbCounts[id] || 0) + 1;
  }

  postMetricsById = Object.fromEntries(
    metricsRows.map((row) => {
      const fromEvents = fbCounts[row.id];
      const fromView = Number(row.facebook_views || 0);
      return [
        row.id,
        {
          ...row,
          // Prefer live event count when available (view may be outdated)
          facebook_views: fromEvents != null ? fromEvents : fromView,
        },
      ];
    }),
  );

  // Include posts that only appear in FB events
  for (const [id, count] of Object.entries(fbCounts)) {
    if (!postMetricsById[id]) {
      postMetricsById[id] = { id, views: 0, read_completes: 0, read_rate: 0, facebook_views: count };
    } else if (!Number(postMetricsById[id].facebook_views)) {
      postMetricsById[id].facebook_views = count;
    }
  }

  renderPosts();
  updateKpis();
}

async function loadMedia() {
  const { data, error } = await supabase
    .from('blog_media')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) throw error;
  mediaItems = data || [];
  renderMedia();
}

function updateKpis() {
  const total = posts.length;
  const published = posts.filter((p) => p.status === 'published').length;
  const draft = posts.filter((p) => p.status === 'draft').length;
  const scheduled = posts.filter((p) => p.status === 'scheduled').length;
  if ($('blog-count-total')) $('blog-count-total').textContent = total;
  if ($('blog-count-published')) $('blog-count-published').textContent = published;
  if ($('blog-count-draft')) $('blog-count-draft').textContent = draft;
  if ($('blog-count-scheduled')) $('blog-count-scheduled').textContent = scheduled;
}

async function loadListingViews() {
  const { data } = await supabase
    .from('blog_listing_metrics_report')
    .select('views')
    .maybeSingle();
  if ($('blog-count-listing-views')) {
    $('blog-count-listing-views').textContent = Number(data?.views || 0);
  }
}

const BRT = 'America/Sao_Paulo';

function brtDayKey(isoString) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: BRT }).format(new Date(isoString));
}

function last7DayKeys() {
  const keys = [];
  const formatter = new Intl.DateTimeFormat('en-CA', { timeZone: BRT });
  for (let offset = 6; offset >= 0; offset -= 1) {
    const date = new Date();
    date.setDate(date.getDate() - offset);
    keys.push(formatter.format(date));
  }
  return keys;
}

function formatDayLabel(dayKey) {
  const date = new Date(`${dayKey}T12:00:00-03:00`);
  return new Intl.DateTimeFormat('pt-BR', {
    weekday: 'short',
    day: '2-digit',
    month: '2-digit',
    timeZone: BRT,
  }).format(date);
}

function isFacebookEvent(row) {
  if (String(row.source || '').toLowerCase() === 'facebook') return true;
  const utm = row.metadata?.utm_source;
  return String(utm || '').toLowerCase() === 'facebook';
}

function ensureChartJs() {
  if (window.Chart) return Promise.resolve(window.Chart);
  if (!chartJsPromise) {
    chartJsPromise = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'https://cdn.jsdelivr.net/npm/chart.js@4.4.7/dist/chart.umd.min.js';
      script.async = true;
      script.onload = () => resolve(window.Chart);
      script.onerror = () => reject(new Error('Não foi possível carregar Chart.js.'));
      document.head.appendChild(script);
    });
  }
  return chartJsPromise;
}

/** CSS zoom on ancestors breaks Chart.js hit-testing; remap pointer coords. */
function getCumulativeZoom(element) {
  let zoom = 1;
  let node = element;
  while (node) {
    const value = window.getComputedStyle(node).zoom;
    if (value && value !== 'normal') {
      const parsed = Number.parseFloat(value);
      if (Number.isFinite(parsed) && parsed > 0) zoom *= parsed;
    }
    node = node.parentElement;
  }
  return zoom;
}

const chartZoomFixPlugin = {
  id: 'chartZoomFix',
  beforeEvent(chart, args) {
    const event = args.event;
    if (!event?.native) return;
    if (!event.type.startsWith('mouse') && !event.type.startsWith('pointer')) return;

    const zoom = getCumulativeZoom(chart.canvas);
    if (zoom === 1) return;

    const rect = chart.canvas.getBoundingClientRect();
    const native = event.native;
    event.x = (native.clientX - rect.left) / zoom;
    event.y = (native.clientY - rect.top) / zoom;
  },
};

async function loadBlogMetricsChart() {
  const canvas = $('blog-metrics-chart');
  const statusEl = $('blog-metrics-chart-status');
  if (!canvas) return;

  const dayKeys = last7DayKeys();
  const sinceIso = new Date(`${dayKeys[0]}T00:00:00-03:00`).toISOString();

  const { data, error } = await supabase
    .from('blog_post_events')
    .select('event_type, source, metadata, created_at')
    .gte('created_at', sinceIso);

  if (error) {
    if (statusEl) {
      statusEl.hidden = false;
      statusEl.textContent = `Erro ao carregar gráfico: ${error.message}`;
      statusEl.classList.add('error');
    }
    return;
  }

  const buckets = Object.fromEntries(
    dayKeys.map((key) => [key, { views: 0, fb: 0, reads: 0 }]),
  );

  for (const row of data || []) {
    const key = brtDayKey(row.created_at);
    const bucket = buckets[key];
    if (!bucket) continue;
    if (row.event_type === 'view') {
      bucket.views += 1;
      if (isFacebookEvent(row)) bucket.fb += 1;
    } else if (row.event_type === 'read_complete') {
      bucket.reads += 1;
    }
  }

  try {
    const Chart = await ensureChartJs();
    const labels = dayKeys.map(formatDayLabel);
    const viewsData = dayKeys.map((key) => buckets[key].views);
    const fbData = dayKeys.map((key) => buckets[key].fb);
    const readsData = dayKeys.map((key) => buckets[key].reads);

    if (blogMetricsChart) {
      blogMetricsChart.destroy();
      blogMetricsChart = null;
    }

    blogMetricsChart = new Chart(canvas, {
      type: 'line',
      plugins: [chartZoomFixPlugin],
      data: {
        labels,
        datasets: [
          {
            label: 'Views',
            data: viewsData,
            borderColor: '#2fb7b0',
            backgroundColor: 'rgba(47, 183, 176, 0.14)',
            tension: 0.35,
            fill: true,
            pointRadius: 4,
            pointHoverRadius: 6,
          },
          {
            label: 'FB',
            data: fbData,
            borderColor: '#7c6ae6',
            backgroundColor: 'rgba(124, 106, 230, 0.1)',
            tension: 0.35,
            fill: false,
            pointRadius: 4,
            pointHoverRadius: 6,
          },
          {
            label: 'Leituras',
            data: readsData,
            borderColor: '#f4a53b',
            backgroundColor: 'rgba(244, 165, 59, 0.1)',
            tension: 0.35,
            fill: false,
            pointRadius: 4,
            pointHoverRadius: 6,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: {
            position: 'top',
            align: 'end',
            labels: { boxWidth: 12, usePointStyle: true, pointStyle: 'circle' },
          },
          tooltip: {
            callbacks: {
              title: (items) => items[0]?.label || '',
            },
          },
        },
        scales: {
          y: {
            beginAtZero: true,
            ticks: { precision: 0 },
            grid: { color: 'rgba(0, 0, 0, 0.06)' },
          },
          x: {
            grid: { display: false },
          },
        },
      },
    });

    requestAnimationFrame(() => {
      blogMetricsChart?.resize();
    });

    if (statusEl) {
      statusEl.hidden = true;
      statusEl.textContent = '';
      statusEl.classList.remove('error');
    }
  } catch (chartError) {
    if (statusEl) {
      statusEl.hidden = false;
      statusEl.textContent = chartError.message || 'Erro ao renderizar o gráfico.';
      statusEl.classList.add('error');
    }
  }
}

function fillCategorySelects() {
  const filter = $('blog-filter-category');
  const formSelect = $('blog-post-category');
  const options = categories.map((c) => `<option value="${escapeHtml(c.id)}">${escapeHtml(c.name)}</option>`).join('');
  if (filter) filter.innerHTML = `<option value="">Todas</option>${options}`;
  if (formSelect) formSelect.innerHTML = `<option value="">Sem categoria</option>${options}`;
}

function renderPosts() {
  const list = $('blog-posts-list');
  if (!list) return;
  const statusFilter = $('blog-filter-status')?.value || '';
  const categoryFilter = $('blog-filter-category')?.value || '';
  const searchQuery = ($('blog-filter-search')?.value || '').trim().toLowerCase();
  const filtered = sortPosts(posts.filter((p) => {
    if (statusFilter && p.status !== statusFilter) return false;
    if (categoryFilter && p.category_id !== categoryFilter) return false;
    if (searchQuery) {
      const haystack = [
        p.title,
        p.slug,
        p.blog_categories?.name,
        STATUS_LABELS[p.status] || p.status,
      ].join(' ').toLowerCase();
      if (!haystack.includes(searchQuery)) return false;
    }
    return true;
  }));

  if (!filtered.length) {
    list.innerHTML = '<p class="metric-empty">Nenhum post encontrado.</p>';
    return;
  }

  list.innerHTML = `
    <table class="blog-posts-table">
      <thead>
        <tr>
          <th class="sortable" data-sort="title"${sortAria('title')} title="Ordenar por título">Título</th>
          <th class="col-center sortable" data-sort="status"${sortAria('status')} title="Ordenar por status">Status</th>
          <th class="col-center sortable" data-sort="category"${sortAria('category')} title="Ordenar por categoria">Categoria</th>
          <th class="col-center sortable" data-sort="views"${sortAria('views')} title="Ordenar por views">Views</th>
          <th class="col-center sortable" data-sort="facebook"${sortAria('facebook')} title="Ordenar por Facebook">FB</th>
          <th class="col-center sortable" data-sort="reads"${sortAria('reads')} title="Ordenar por leituras">Leituras</th>
          <th class="col-center sortable" data-sort="rate"${sortAria('rate')} title="Ordenar por taxa">Taxa</th>
          <th class="col-center sortable" data-sort="published_at"${sortAria('published_at')} title="Ordenar por publicação">Publicação</th>
          <th class="col-actions"></th>
        </tr>
      </thead>
      <tbody>
        ${filtered.map((p) => {
          const metrics = postMetricsById[p.id] || {};
          return `
          <tr>
            <td>
              <strong>${escapeHtml(p.title)}</strong>
            </td>
            <td class="col-center"><span class="status-chip status-${escapeHtml(p.status)}">${escapeHtml(STATUS_LABELS[p.status] || p.status)}</span></td>
            <td class="col-center">${escapeHtml(p.blog_categories?.name || '—')}</td>
            <td class="col-center">${Number(metrics.views || 0)}</td>
            <td class="col-center">${Number(metrics.facebook_views || 0)}</td>
            <td class="col-center">${Number(metrics.read_completes || 0)}</td>
            <td class="col-center">${formatRate(metrics.read_rate)}</td>
            <td class="col-center">${p.published_at ? escapeHtml(new Date(p.published_at).toLocaleString('pt-BR')) : '—'}</td>
            <td class="table-actions">
              <button
                type="button"
                class="btn-ghost btn-sm"
                data-blog-view="${escapeHtml(p.id)}"
                ${p.status !== 'published' ? 'disabled title="Publique o post antes de visualizar a página pública"' : 'title="Abre o post sem contabilizar visualização/leitura"'}
              >Visualizar</button>
              <button type="button" class="btn-ghost btn-sm" data-blog-edit="${escapeHtml(p.id)}">Editar</button>
              <button
                type="button"
                class="btn-ghost btn-sm btn-facebook${p.facebook_post_id ? ' is-posted' : ''}"
                data-blog-facebook="${escapeHtml(p.id)}"
                ${p.status !== 'published' ? 'disabled title="Publique o post antes de compartilhar no Facebook"' : ''}
              >${p.facebook_post_id ? 'Repostar FB' : 'Postar no Facebook'}</button>
              ${p.facebook_post_id ? `
              <button
                type="button"
                class="btn-ghost btn-sm btn-facebook-delete"
                data-blog-facebook-delete="${escapeHtml(p.id)}"
              >Excluir postagem</button>` : ''}
              <button type="button" class="btn-sm btn-danger" data-blog-delete="${escapeHtml(p.id)}">Excluir</button>
            </td>
          </tr>
        `;
        }).join('')}
      </tbody>
    </table>
  `;

  bindPostsSortHeaders(list);

  list.querySelectorAll('[data-blog-view]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const post = posts.find((p) => p.id === btn.dataset.blogView);
      if (!post?.slug || post.status !== 'published') return;
      window.open(blogPreviewUrl(post.slug), '_blank', 'noopener,noreferrer');
    });
  });
  list.querySelectorAll('[data-blog-edit]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const post = posts.find((p) => p.id === btn.dataset.blogEdit);
      if (post) openPostModal(post);
    });
  });
  list.querySelectorAll('[data-blog-facebook]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const post = posts.find((p) => p.id === btn.dataset.blogFacebook);
      if (post) openFacebookModal(post);
    });
  });
  list.querySelectorAll('[data-blog-facebook-delete]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const post = posts.find((p) => p.id === btn.dataset.blogFacebookDelete);
      if (post) openFacebookDeleteModal(post);
    });
  });
  list.querySelectorAll('[data-blog-delete]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      if (!window.confirm('Excluir este post permanentemente?')) return;
      const { error } = await supabase.from('blog_posts').delete().eq('id', btn.dataset.blogDelete);
      if (error) {
        alert(error.message);
        return;
      }
      await loadPosts();
    });
  });
}

function closeFacebookModal() {
  facebookModalPost = null;
  const modal = $('blog-facebook-modal');
  if (modal?.open) modal.close();
}

function openFacebookModal(post) {
  if (!post || post.status !== 'published') {
    alert('Só é possível postar no Facebook posts publicados.');
    return;
  }

  facebookModalPost = post;
  const modal = $('blog-facebook-modal');
  const titleEl = $('blog-facebook-post-title');
  const linkEl = $('blog-facebook-post-link');
  const messageEl = $('blog-facebook-message');
  const alreadyEl = $('blog-facebook-already');
  const statusEl = $('blog-facebook-form-status');
  const idEl = $('blog-facebook-post-id');
  const confirmBtn = $('blog-facebook-confirm-btn');

  if (!modal || !messageEl) return;

  const url = blogFacebookShareUrl(post.slug);
  if (idEl) idEl.value = post.id;
  if (titleEl) titleEl.textContent = post.title || '';
  if (linkEl) {
    linkEl.href = url;
    linkEl.textContent = url;
  }
  messageEl.value = defaultFacebookMessage(post);
  if (statusEl) {
    statusEl.textContent = '';
    statusEl.className = 'form-status';
  }
  if (alreadyEl) {
    alreadyEl.hidden = !post.facebook_post_id;
  }
  if (confirmBtn) {
    confirmBtn.disabled = false;
    confirmBtn.textContent = post.facebook_post_id ? 'Confirmar e repostar' : 'Confirmar e postar';
  }

  if (typeof modal.showModal === 'function') modal.showModal();
  else modal.setAttribute('open', '');
}

async function submitFacebookPost(event) {
  event.preventDefault();
  const statusEl = $('blog-facebook-form-status');
  const confirmBtn = $('blog-facebook-confirm-btn');
  const messageEl = $('blog-facebook-message');
  const post = facebookModalPost || posts.find((p) => p.id === $('blog-facebook-post-id')?.value);

  if (!post) {
    showResultModal({
      type: 'error',
      title: 'Post não encontrado',
      message: 'Recarregue a lista e tente novamente.',
    });
    return;
  }

  const message = String(messageEl?.value || '').trim();
  if (!message) {
    if (statusEl) {
      statusEl.textContent = 'Escreva uma mensagem para o post.';
      statusEl.classList.add('error');
    }
    return;
  }

  if (statusEl) {
    statusEl.textContent = '';
    statusEl.className = 'form-status';
  }
  if (confirmBtn) confirmBtn.disabled = true;
  showBusyOverlay('Publicando no Facebook...');

  try {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session?.access_token) {
      throw new Error('Sessão expirada. Faça login novamente.');
    }

    const response = await fetch('/api/blog/facebook-post', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({
        id: post.id,
        message,
        force: Boolean(post.facebook_post_id),
      }),
    });

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(payload.error || `HTTP ${response.status}`);
    }

    await loadPosts();
    hideBusyOverlay();
    closeFacebookModal();
    showResultModal({
      type: 'success',
      title: 'Postagem publicada',
      message: 'O conteúdo foi publicado na Página do Facebook.',
      linkHref: payload.facebook_url || '',
      linkLabel: 'Ver no Facebook',
    });
  } catch (error) {
    hideBusyOverlay();
    if (confirmBtn) confirmBtn.disabled = false;
    showResultModal({
      type: 'error',
      title: 'Falha ao postar',
      message: error.message || 'Não foi possível publicar no Facebook.',
    });
  }
}

function closeFacebookDeleteModal() {
  facebookDeleteModalPost = null;
  const modal = $('blog-facebook-delete-modal');
  if (modal?.open) modal.close();
}

function openFacebookDeleteModal(post) {
  if (!post?.facebook_post_id) {
    alert('Este post não tem postagem registrada no Facebook.');
    return;
  }

  facebookDeleteModalPost = post;
  const modal = $('blog-facebook-delete-modal');
  const titleEl = $('blog-facebook-delete-post-title');
  const idEl = $('blog-facebook-delete-post-id');
  const statusEl = $('blog-facebook-delete-form-status');
  const confirmBtn = $('blog-facebook-delete-confirm-btn');

  if (!modal) return;

  if (idEl) idEl.value = post.id;
  if (titleEl) titleEl.textContent = post.title || '';
  if (statusEl) {
    statusEl.textContent = '';
    statusEl.className = 'form-status';
  }
  if (confirmBtn) {
    confirmBtn.disabled = false;
    confirmBtn.textContent = 'Excluir postagem';
  }

  if (typeof modal.showModal === 'function') modal.showModal();
  else modal.setAttribute('open', '');
}

async function submitFacebookDelete(event) {
  event.preventDefault();
  const statusEl = $('blog-facebook-delete-form-status');
  const confirmBtn = $('blog-facebook-delete-confirm-btn');
  const post =
    facebookDeleteModalPost ||
    posts.find((p) => p.id === $('blog-facebook-delete-post-id')?.value);

  if (!post) {
    if (statusEl) {
      statusEl.textContent = 'Post não encontrado.';
      statusEl.classList.add('error');
    }
    return;
  }

  if (statusEl) {
    statusEl.textContent = 'Excluindo postagem no Facebook...';
    statusEl.className = 'form-status';
  }
  if (confirmBtn) confirmBtn.disabled = true;

  try {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session?.access_token) {
      throw new Error('Sessão expirada. Faça login novamente.');
    }

    const response = await fetch(`/api/blog/facebook-post?id=${encodeURIComponent(post.id)}`, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({ id: post.id }),
    });

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(payload.error || `HTTP ${response.status}`);
    }

    if (statusEl) {
      statusEl.textContent = payload.already_gone
        ? 'Postagem já não existia no Facebook. Registro local limpo.'
        : 'Postagem excluída do Facebook.';
      statusEl.className = 'form-status';
    }

    await loadPosts();
    setTimeout(() => closeFacebookDeleteModal(), 900);
  } catch (error) {
    if (statusEl) {
      statusEl.textContent = error.message || 'Falha ao excluir a postagem do Facebook.';
      statusEl.classList.add('error');
    }
    if (confirmBtn) confirmBtn.disabled = false;
  }
}

function renderCategories() {
  const list = $('blog-categories-list');
  if (!list) return;
  if (!categories.length) {
    list.innerHTML = '<p class="metric-empty">Nenhuma categoria cadastrada.</p>';
    return;
  }
  list.innerHTML = `
    <table>
      <thead><tr><th>Nome</th><th>Slug</th><th>Ordem</th><th></th></tr></thead>
      <tbody>
        ${categories.map((c) => `
          <tr>
            <td><strong>${escapeHtml(c.name)}</strong></td>
            <td>${escapeHtml(c.slug)}</td>
            <td>${escapeHtml(c.sort_order)}</td>
            <td class="table-actions">
              <button type="button" class="btn-ghost" data-cat-edit="${escapeHtml(c.id)}">Editar</button>
              <button type="button" class="btn-ghost" data-cat-delete="${escapeHtml(c.id)}">Excluir</button>
            </td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;
  list.querySelectorAll('[data-cat-edit]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const item = categories.find((c) => c.id === btn.dataset.catEdit);
      if (item) openCatModal(item);
    });
  });
  list.querySelectorAll('[data-cat-delete]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      if (!window.confirm('Excluir categoria?')) return;
      const { error } = await supabase.from('blog_categories').delete().eq('id', btn.dataset.catDelete);
      if (error) alert(error.message);
      else await loadCategories();
    });
  });
}

function renderTags() {
  const list = $('blog-tags-list');
  if (!list) return;
  if (!tags.length) {
    list.innerHTML = '<p class="metric-empty">Nenhuma tag cadastrada.</p>';
    return;
  }
  list.innerHTML = `
    <table>
      <thead><tr><th>Nome</th><th>Slug</th><th></th></tr></thead>
      <tbody>
        ${tags.map((t) => `
          <tr>
            <td><strong>${escapeHtml(t.name)}</strong></td>
            <td>${escapeHtml(t.slug)}</td>
            <td class="table-actions">
              <button type="button" class="btn-ghost" data-tag-edit="${escapeHtml(t.id)}">Editar</button>
              <button type="button" class="btn-ghost" data-tag-delete="${escapeHtml(t.id)}">Excluir</button>
            </td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;
  list.querySelectorAll('[data-tag-edit]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const item = tags.find((t) => t.id === btn.dataset.tagEdit);
      if (item) openTagModal(item);
    });
  });
  list.querySelectorAll('[data-tag-delete]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      if (!window.confirm('Excluir tag?')) return;
      const { error } = await supabase.from('blog_tags').delete().eq('id', btn.dataset.tagDelete);
      if (error) alert(error.message);
      else await loadTags();
    });
  });
}

function renderMedia() {
  const grid = $('blog-media-grid');
  if (!grid) return;
  if (!mediaItems.length) {
    grid.innerHTML = '<p class="metric-empty">Nenhuma mídia enviada.</p>';
    return;
  }
  grid.innerHTML = mediaItems.map((m) => `
    <article class="blog-media-card">
      <img src="${escapeHtml(m.url)}" alt="${escapeHtml(m.alt_text || m.file_name)}" />
      <div class="blog-media-card-actions">
        <button type="button" class="btn-ghost" data-media-copy="${escapeHtml(m.url)}">Copiar URL</button>
        <button type="button" class="btn-ghost" data-media-delete="${escapeHtml(m.id)}" data-media-path="${escapeHtml(m.path)}">Excluir</button>
      </div>
    </article>
  `).join('');

  grid.querySelectorAll('[data-media-copy]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(btn.dataset.mediaCopy);
        btn.textContent = 'Copiado!';
        setTimeout(() => { btn.textContent = 'Copiar URL'; }, 1200);
      } catch {
        window.prompt('Copie a URL:', btn.dataset.mediaCopy);
      }
    });
  });
  grid.querySelectorAll('[data-media-delete]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      if (!window.confirm('Excluir arquivo da biblioteca?')) return;
      const path = btn.dataset.mediaPath;
      if (path) await supabase.storage.from(BLOG_IMAGES_BUCKET).remove([path]);
      await supabase.from('blog_media').delete().eq('id', btn.dataset.mediaDelete);
      await loadMedia();
    });
  });
}

async function ensureTagsFromNames(names) {
  const resultIds = [];
  for (const raw of names) {
    const name = raw.trim();
    if (!name) continue;
    const slug = slugify(name);
    let existing = tags.find((t) => t.slug === slug || t.name.toLowerCase() === name.toLowerCase());
    if (!existing) {
      const { data: found } = await supabase
        .from('blog_tags')
        .select('*')
        .eq('slug', slug)
        .maybeSingle();
      existing = found;
    }
    if (!existing) {
      const { data, error } = await supabase
        .from('blog_tags')
        .insert({ name, slug })
        .select('*')
        .maybeSingle();
      if (error) throw error;
      existing = data;
      if (existing) tags.push(existing);
    }
    if (existing?.id) resultIds.push(existing.id);
  }
  return [...new Set(resultIds)];
}

function openPostModal(post = null) {
  const modal = $('blog-post-modal');
  if (!modal) return;
  slugManual = Boolean(post);
  $('blog-post-form-title').textContent = post ? 'Editar post' : 'Novo post';
  $('blog-post-id').value = post?.id || '';
  $('blog-title').value = post?.title || '';
  $('blog-slug').value = post?.slug || '';
  $('blog-excerpt').value = post?.excerpt || '';
  $('blog-post-status').value = post?.status || 'draft';
  $('blog-published-at').value = toLocalInputValue(post?.published_at);
  $('blog-post-category').value = post?.category_id || '';
  $('blog-seo-title').value = post?.seo_title || '';
  $('blog-seo-description').value = post?.seo_description || '';
  $('blog-author').value = post?.author_name || 'Papelê Educa';
  $('blog-featured').checked = Boolean(post?.featured);
  $('blog-cover-path').value = post?.cover_path || '';
  $('blog-cover-url').value = post?.cover_url || '';
  $('blog-og-path').value = post?.og_image_path || '';
  $('blog-og-url').value = post?.og_image_url || '';
  pendingCover = null;
  pendingOg = null;
  setPreview($('blog-cover-preview'), post?.cover_url || '');
  setPreview($('blog-og-preview'), post?.og_image_url || '');

  const tagNames = (post?.blog_post_tags || [])
    .map((row) => row.blog_tags?.name)
    .filter(Boolean);
  $('blog-post-tags').value = tagNames.join(', ');

  setEditorContent(post?.content_html || '<p></p>');
  $('blog-post-form-status').textContent = '';
  $('blog-post-form-status').className = 'form-status';
  if (!modal.open) modal.showModal();
}

function closePostModal() {
  const modal = $('blog-post-modal');
  if (modal?.open) modal.close();
}

function openCatModal(item = null) {
  $('blog-cat-form-title').textContent = item ? 'Editar categoria' : 'Nova categoria';
  $('blog-cat-id').value = item?.id || '';
  $('blog-cat-name').value = item?.name || '';
  $('blog-cat-slug').value = item?.slug || '';
  $('blog-cat-description').value = item?.description || '';
  $('blog-cat-sort').value = item?.sort_order ?? 0;
  $('blog-cat-form-status').textContent = '';
  const modal = $('blog-cat-modal');
  if (modal && !modal.open) modal.showModal();
}

function openTagModal(item = null) {
  $('blog-tag-form-title').textContent = item ? 'Editar tag' : 'Nova tag';
  $('blog-tag-id').value = item?.id || '';
  $('blog-tag-name').value = item?.name || '';
  $('blog-tag-slug').value = item?.slug || '';
  $('blog-tag-form-status').textContent = '';
  const modal = $('blog-tag-modal');
  if (modal && !modal.open) modal.showModal();
}

function bindEvents() {
  if (bound) return;
  bound = true;

  document.querySelectorAll('.blog-tab').forEach((btn) => {
    btn.addEventListener('click', () => switchTab(btn.dataset.blogTab));
  });

  $('blog-filter-status')?.addEventListener('change', renderPosts);
  $('blog-filter-category')?.addEventListener('change', renderPosts);
  $('blog-filter-search')?.addEventListener('input', renderPosts);

  $('blog-post-new-btn')?.addEventListener('click', () => openPostModal());
  $('blog-post-cancel-btn')?.addEventListener('click', closePostModal);
  $('blog-post-modal-close')?.addEventListener('click', closePostModal);

  $('blog-title')?.addEventListener('input', () => {
    if (slugManual) return;
    $('blog-slug').value = slugify($('blog-title').value);
  });
  $('blog-slug')?.addEventListener('input', () => { slugManual = true; });

  $('blog-cover-file')?.addEventListener('change', () => {
    pendingCover = $('blog-cover-file').files?.[0] || null;
    if (pendingCover) setPreview($('blog-cover-preview'), URL.createObjectURL(pendingCover));
  });
  $('blog-og-file')?.addEventListener('change', () => {
    pendingOg = $('blog-og-file').files?.[0] || null;
    if (pendingOg) setPreview($('blog-og-preview'), URL.createObjectURL(pendingOg));
  });

  $('blog-post-form')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const statusEl = $('blog-post-form-status');
    statusEl.textContent = 'Salvando...';
    statusEl.className = 'form-status';

    try {
      const title = $('blog-title').value.trim();
      const slug = slugify($('blog-slug').value.trim() || title);
      const status = $('blog-post-status').value;
      let publishedAt = fromLocalInputValue($('blog-published-at').value);
      if (status === 'published' && !publishedAt) publishedAt = new Date().toISOString();
      if (status === 'scheduled' && !publishedAt) {
        throw new Error('Informe a data/hora de publicação para posts agendados.');
      }

      let coverPath = $('blog-cover-path').value;
      let coverUrl = $('blog-cover-url').value;
      let ogPath = $('blog-og-path').value;
      let ogUrl = $('blog-og-url').value;

      if (pendingCover) {
        const uploaded = await uploadBlogFile(pendingCover, 'covers');
        coverPath = uploaded.path;
        coverUrl = uploaded.url;
      }
      if (pendingOg) {
        const uploaded = await uploadBlogFile(pendingOg, 'og');
        ogPath = uploaded.path;
        ogUrl = uploaded.url;
      }

      const contentHtml = getEditorHtml();
      const payload = {
        title,
        slug,
        excerpt: $('blog-excerpt').value.trim(),
        content_html: contentHtml,
        content_json: getEditorJson(),
        status,
        published_at: publishedAt,
        cover_path: coverPath,
        cover_url: coverUrl,
        og_image_path: ogPath,
        og_image_url: ogUrl || coverUrl,
        seo_title: $('blog-seo-title').value.trim() || title,
        seo_description: $('blog-seo-description').value.trim() || $('blog-excerpt').value.trim(),
        author_name: $('blog-author').value.trim() || 'Papelê Educa',
        reading_time_min: estimateReadingTime(contentHtml),
        featured: $('blog-featured').checked,
        category_id: $('blog-post-category').value || null,
        updated_at: new Date().toISOString(),
      };

      const id = $('blog-post-id').value;
      let postId = id;
      if (id) {
        const { error } = await supabase.from('blog_posts').update(payload).eq('id', id);
        if (error) throw error;
      } else {
        const { data, error } = await supabase.from('blog_posts').insert(payload).select('id').maybeSingle();
        if (error) throw error;
        postId = data.id;
      }

      const tagNames = ($('blog-post-tags').value || '').split(',');
      const tagIds = await ensureTagsFromNames(tagNames);
      await supabase.from('blog_post_tags').delete().eq('post_id', postId);
      if (tagIds.length) {
        const rows = tagIds.map((tag_id) => ({ post_id: postId, tag_id }));
        const { error: tagError } = await supabase.from('blog_post_tags').insert(rows);
        if (tagError) throw tagError;
      }

      statusEl.textContent = 'Post salvo com sucesso.';
      closePostModal();
      await Promise.all([loadPosts(), loadTags()]);
    } catch (error) {
      statusEl.textContent = error.message || 'Erro ao salvar.';
      statusEl.classList.add('error');
    }
  });

  $('blog-cat-new-btn')?.addEventListener('click', () => openCatModal());
  $('blog-cat-cancel-btn')?.addEventListener('click', () => $('blog-cat-modal')?.close());
  $('blog-cat-modal-close')?.addEventListener('click', () => $('blog-cat-modal')?.close());
  $('blog-cat-name')?.addEventListener('input', () => {
    if (!$('blog-cat-id').value) $('blog-cat-slug').value = slugify($('blog-cat-name').value);
  });
  $('blog-cat-form')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const statusEl = $('blog-cat-form-status');
    statusEl.textContent = 'Salvando...';
    try {
      const payload = {
        name: $('blog-cat-name').value.trim(),
        slug: slugify($('blog-cat-slug').value.trim()),
        description: $('blog-cat-description').value.trim(),
        sort_order: Number($('blog-cat-sort').value || 0),
        updated_at: new Date().toISOString(),
      };
      const id = $('blog-cat-id').value;
      const { error } = id
        ? await supabase.from('blog_categories').update(payload).eq('id', id)
        : await supabase.from('blog_categories').insert(payload);
      if (error) throw error;
      $('blog-cat-modal')?.close();
      await loadCategories();
    } catch (error) {
      statusEl.textContent = error.message;
      statusEl.classList.add('error');
    }
  });

  $('blog-tag-new-btn')?.addEventListener('click', () => openTagModal());
  $('blog-tag-cancel-btn')?.addEventListener('click', () => $('blog-tag-modal')?.close());
  $('blog-tag-modal-close')?.addEventListener('click', () => $('blog-tag-modal')?.close());
  $('blog-facebook-form')?.addEventListener('submit', submitFacebookPost);
  $('blog-facebook-cancel-btn')?.addEventListener('click', closeFacebookModal);
  $('blog-facebook-modal-close')?.addEventListener('click', closeFacebookModal);
  $('blog-facebook-modal')?.addEventListener('cancel', (event) => {
    event.preventDefault();
    closeFacebookModal();
  });
  $('blog-facebook-delete-form')?.addEventListener('submit', submitFacebookDelete);
  $('blog-facebook-delete-cancel-btn')?.addEventListener('click', closeFacebookDeleteModal);
  $('blog-facebook-delete-modal-close')?.addEventListener('click', closeFacebookDeleteModal);
  $('blog-facebook-delete-modal')?.addEventListener('cancel', (event) => {
    event.preventDefault();
    closeFacebookDeleteModal();
  });
  $('blog-tag-name')?.addEventListener('input', () => {
    if (!$('blog-tag-id').value) $('blog-tag-slug').value = slugify($('blog-tag-name').value);
  });
  $('blog-tag-form')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const statusEl = $('blog-tag-form-status');
    statusEl.textContent = 'Salvando...';
    try {
      const payload = {
        name: $('blog-tag-name').value.trim(),
        slug: slugify($('blog-tag-slug').value.trim()),
      };
      const id = $('blog-tag-id').value;
      const { error } = id
        ? await supabase.from('blog_tags').update(payload).eq('id', id)
        : await supabase.from('blog_tags').insert(payload);
      if (error) throw error;
      $('blog-tag-modal')?.close();
      await loadTags();
    } catch (error) {
      statusEl.textContent = error.message;
      statusEl.classList.add('error');
    }
  });

  $('blog-media-upload')?.addEventListener('change', async () => {
    const statusEl = $('blog-media-status');
    const files = Array.from($('blog-media-upload').files || []);
    if (!files.length) return;
    statusEl.textContent = `Enviando ${files.length} arquivo(s)...`;
    try {
      for (const file of files) {
        await uploadBlogFile(file, 'library');
      }
      statusEl.textContent = 'Upload concluído.';
      $('blog-media-upload').value = '';
      await loadMedia();
    } catch (error) {
      statusEl.textContent = error.message;
      statusEl.classList.add('error');
    }
  });

  $('blog-api-test-form')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const statusEl = $('blog-api-test-status');
    const key = $('blog-api-test-key')?.value.trim();
    if (!key) {
      statusEl.textContent = 'Cole a X-API-Key para testar.';
      statusEl.classList.add('error');
      return;
    }
    statusEl.textContent = 'Enviando post de teste...';
    statusEl.className = 'form-status';
    try {
      const stamp = new Date().toLocaleString('pt-BR');
      const response = await fetch('/api/blog/posts', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': key,
        },
        body: JSON.stringify({
          title: `[TESTE API] Post automático ${stamp}`,
          content_html: '<p>Conteúdo gerado pelo teste da API do robô. Este post deve permanecer em <strong>rascunho</strong>.</p>',
          excerpt: 'Post de teste da API — rascunho.',
          status: 'published',
          tags: ['teste-api'],
          category: 'Educação Infantil',
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || `HTTP ${response.status}`);
      if (payload.status !== 'draft') throw new Error('A API não forçou status draft.');
      statusEl.innerHTML = `Rascunho criado: <code>${escapeHtml(payload.slug)}</code>. <a href="#/blog">Atualizar lista</a>`;
      await loadPosts();
      switchTab('posts');
    } catch (error) {
      statusEl.textContent = error.message;
      statusEl.classList.add('error');
    }
  });
}

export async function initBlogCms() {
  if (!bound) {
    bindEvents();
    await initBlogEditor({
      element: $('blog-editor'),
      onImageRequest: async () => {
        const input = $('blog-editor-image-input');
        if (!input) return;
        input.value = '';
        input.click();
        await new Promise((resolve) => {
          const handler = async () => {
            input.removeEventListener('change', handler);
            const file = input.files?.[0];
            if (!file) {
              resolve();
              return;
            }
            try {
              const uploaded = await uploadBlogFile(file, 'content');
              insertEditorImage(uploaded.url, file.name);
            } catch (error) {
              alert(error.message);
            }
            resolve();
          };
          input.addEventListener('change', handler);
        });
      },
    });
  }

  await initBlogSettings();

  try {
    await Promise.all([
      loadCategories(),
      loadTags(),
      loadPosts(),
      loadMedia(),
      loadListingViews(),
      loadBlogMetricsChart(),
    ]);
  } catch (error) {
    const list = $('blog-posts-list');
    if (list) {
      list.innerHTML = `<p class="metric-empty">Erro ao carregar o CMS: ${escapeHtml(error.message)}. Execute supabase-blog-cms.sql no Supabase.</p>`;
    }
  }
}
