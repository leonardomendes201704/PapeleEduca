import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.49.1/+esm';
import { SUPABASE_URL, SUPABASE_ANON_KEY, SITE_URL, ENABLE_PUSH } from './config.js';

const LIST_FIELDS = 'id,title,slug,excerpt,status,cover_url,published_at,created_at,updated_at,facebook_post_id,seo_description,author_name';
const DETAIL_FIELDS = `${LIST_FIELDS},content_html`;

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false,
    storage: window.localStorage,
  },
});

const $ = (id) => document.getElementById(id);

const ONLINE_WINDOW_MS = 2 * 60 * 1000;

const state = {
  filter: 'draft',
  posts: [],
  current: null,
  busy: false,
  tab: 'list',
  metricsLoaded: false,
  onlinePoll: null,
};

let CapacitorApp = null;
let PushNotifications = null;

async function loadCapacitor() {
  // Wait briefly for native-plugins.bundle.js to register window.__PE_CAP
  for (let i = 0; i < 20; i += 1) {
    if (window.__PE_CAP?.App || window.__PE_CAP?.PushNotifications) break;
    await new Promise((r) => setTimeout(r, 50));
  }
  CapacitorApp = window.__PE_CAP?.App || null;
  PushNotifications = window.__PE_CAP?.PushNotifications || null;
}

function showToast(message, { error = false } = {}) {
  const el = $('toast');
  if (!el) return;
  el.textContent = message;
  el.classList.toggle('error', error);
  el.hidden = false;
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => {
    el.hidden = true;
  }, 2800);
}

function showScreen(name) {
  ['login', 'list', 'metrics', 'detail'].forEach((key) => {
    const el = $(`screen-${key}`);
    if (el) el.hidden = key !== name;
  });
  const nav = $('bottom-nav');
  if (nav) {
    const showNav = name === 'list' || name === 'metrics';
    nav.hidden = !showNav;
    if (showNav) {
      nav.querySelectorAll('.nav-item').forEach((btn) => {
        btn.classList.toggle('active', btn.dataset.nav === name);
      });
      state.tab = name;
    }
  }
}

function formatPercent(value) {
  return `${Math.round(Number(value || 0) * 100)}%`;
}

function renderMetricKpis(kpis) {
  const el = $('metrics-kpis');
  if (!el) return;
  const items = [
    { label: 'Visitantes online', value: kpis.online, live: true },
    { label: 'Vis. produtos', value: kpis.productViews },
    { label: 'Cliques compra', value: kpis.buyClicks },
    { label: 'Vis. posts', value: kpis.blogViews },
    { label: 'Leituras', value: kpis.blogReads },
    { label: 'Posts via FB', value: kpis.blogFacebook },
    { label: 'Taxa leitura', value: formatPercent(kpis.blogRate) },
  ];
  el.innerHTML = items
    .map(
      (item) => `
      <div class="metric-kpi${item.live ? ' metric-kpi--live' : ''}">
        <span class="label">${escapeHtml(item.label)}</span>
        <span class="value">${escapeHtml(String(item.value ?? 0))}</span>
      </div>`
    )
    .join('');
}

async function fetchOnlineCount() {
  const since = new Date(Date.now() - ONLINE_WINDOW_MS).toISOString();
  const { count, error } = await supabase
    .from('site_presence')
    .select('visitor_id', { count: 'exact', head: true })
    .gte('last_seen_at', since);
  if (error) {
    // Table not created yet — show 0 without failing the whole screen.
    if (/site_presence|does not exist|schema cache/i.test(error.message || '')) {
      return 0;
    }
    throw error;
  }
  return Number(count || 0);
}

function stopOnlinePoll() {
  if (state.onlinePoll) {
    clearInterval(state.onlinePoll);
    state.onlinePoll = null;
  }
}

function startOnlinePoll() {
  stopOnlinePoll();
  state.onlinePoll = setInterval(() => {
    if ($('screen-metrics')?.hidden) {
      stopOnlinePoll();
      return;
    }
    void fetchOnlineCount()
      .then((online) => {
        const live = document.querySelector('.metric-kpi--live .value');
        if (live) live.textContent = String(online);
      })
      .catch(() => {});
  }, 20_000);
}

function metricIcon(kind) {
  const common = 'class="metric-ico" viewBox="0 0 24 24" width="14" height="14" aria-hidden="true" focusable="false"';
  if (kind === 'eye') {
    return `<svg ${common} fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7S1 12 1 12z"/><circle cx="12" cy="12" r="3"/></svg>`;
  }
  if (kind === 'cart') {
    return `<svg ${common} fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="20" r="1.5"/><circle cx="18" cy="20" r="1.5"/><path d="M1 1h3l2.2 11.2a2 2 0 0 0 2 1.6h9.4a2 2 0 0 0 2-1.5L22 6H6"/></svg>`;
  }
  if (kind === 'facebook') {
    return `<svg ${common} fill="currentColor"><path d="M14 8h2.5V5.5A16 16 0 0 0 13.2 5C10.6 5 9 6.6 9 9.4V12H6.5v3H9v8h3.5v-8H15l.5-3H12.5V9.7c0-.9.2-1.7 1.5-1.7z"/></svg>`;
  }
  if (kind === 'read') {
    return `<svg ${common} fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M4 4.5A2.5 2.5 0 0 1 6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5z"/></svg>`;
  }
  return '';
}

function metricStat(kind, value, label) {
  const extra = kind === 'facebook' ? ' metric-stat--fb' : '';
  return `<span class="metric-stat${extra}" title="${escapeHtml(label)}">${metricIcon(kind)}<span>${escapeHtml(String(value ?? 0))}</span></span>`;
}

function renderMetricRows(containerId, rows, mapper) {
  const el = $(containerId);
  if (!el) return;
  if (!rows.length) {
    el.innerHTML = '<p class="empty" style="padding:0.5rem 0">Sem dados ainda.</p>';
    return;
  }
  el.innerHTML = rows
    .slice(0, 8)
    .map((row) => {
      const { name, category, statsHtml } = mapper(row);
      return `
        <div class="metric-row">
          <div>
            <div class="name">${escapeHtml(name)}</div>
            <div class="sub">${escapeHtml(category || '')}</div>
          </div>
          <div class="nums">${statsHtml}</div>
        </div>`;
    })
    .join('');
}

async function loadMetrics() {
  const errEl = $('metrics-error');
  if (errEl) errEl.hidden = true;
  try {
    // Do not select facebook_views from report views — older Supabase schemas
    // omit that column; count Facebook from events instead (same as admin).
    const [productsRes, blogRes, productFbRes, blogFbRes, online] = await Promise.all([
      supabase
        .from('product_metrics_report')
        .select('id,title,category,views,opens,buy_clicks')
        .order('views', { ascending: false })
        .limit(20),
      supabase
        .from('blog_post_metrics_report')
        .select('id,title,category,views,read_completes,read_rate')
        .order('views', { ascending: false })
        .limit(20),
      supabase
        .from('product_events')
        .select('product_id')
        .eq('event_type', 'view')
        .eq('source', 'facebook'),
      supabase
        .from('blog_post_events')
        .select('blog_post_id')
        .eq('event_type', 'view')
        .eq('source', 'facebook'),
      fetchOnlineCount().catch(() => 0),
    ]);

    if (productsRes.error) throw productsRes.error;
    if (blogRes.error) throw blogRes.error;

    const productFbCounts = {};
    for (const row of productFbRes.data || []) {
      const id = row.product_id;
      if (!id) continue;
      productFbCounts[id] = (productFbCounts[id] || 0) + 1;
    }
    const blogFbCounts = {};
    for (const row of blogFbRes.data || []) {
      const id = row.blog_post_id;
      if (!id) continue;
      blogFbCounts[id] = (blogFbCounts[id] || 0) + 1;
    }

    const products = (productsRes.data || []).map((row) => ({
      ...row,
      facebook_views: productFbCounts[row.id] || 0,
    }));
    const posts = (blogRes.data || []).map((row) => ({
      ...row,
      facebook_views: blogFbCounts[row.id] || 0,
    }));

    const productViews = products.reduce((s, r) => s + Number(r.views || 0), 0);
    const buyClicks = products.reduce((s, r) => s + Number(r.buy_clicks || 0), 0);
    const blogViews = posts.reduce((s, r) => s + Number(r.views || 0), 0);
    const blogReads = posts.reduce((s, r) => s + Number(r.read_completes || 0), 0);
    const blogFacebook = posts.reduce((s, r) => s + Number(r.facebook_views || 0), 0);

    renderMetricKpis({
      online,
      productViews,
      buyClicks,
      blogViews,
      blogReads,
      blogFacebook,
      blogRate: blogViews > 0 ? blogReads / blogViews : 0,
    });
    startOnlinePoll();

    renderMetricRows(
      'metrics-products',
      products.filter((r) => Number(r.views || 0) > 0 || Number(r.buy_clicks || 0) > 0),
      (r) => ({
        name: r.title || 'Produto',
        category: r.category || 'Sem categoria',
        statsHtml: [
          metricStat('eye', r.views || 0, 'Visualizações'),
          metricStat('cart', r.buy_clicks || 0, 'Cliques de compra'),
          metricStat('facebook', r.facebook_views || 0, 'Facebook'),
        ].join(''),
      })
    );

    renderMetricRows(
      'metrics-posts',
      posts.filter((r) => Number(r.views || 0) > 0 || Number(r.read_completes || 0) > 0),
      (r) => ({
        name: r.title || 'Post',
        category: r.category || 'Blog',
        statsHtml: [
          metricStat('eye', r.views || 0, 'Visualizações'),
          metricStat('read', r.read_completes || 0, 'Leituras'),
          metricStat('facebook', r.facebook_views || 0, 'Facebook'),
        ].join(''),
      })
    );

    state.metricsLoaded = true;
  } catch (err) {
    if (errEl) {
      errEl.textContent = err.message || 'Erro ao carregar métricas.';
      errEl.hidden = false;
    }
  }
}

async function openTab(name) {
  if (name === 'metrics') {
    showScreen('metrics');
    await loadMetrics();
    return;
  }
  stopOnlinePoll();
  showScreen('list');
  if (!state.posts.length) await loadPosts();
  else renderList();
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

function statusLabel(status) {
  const map = {
    draft: 'Rascunho',
    published: 'Publicado',
    scheduled: 'Agendado',
    archived: 'Arquivado',
  };
  return map[status] || status || '—';
}

function formatDate(value) {
  if (!value) return '';
  try {
    return new Date(value).toLocaleString('pt-BR', {
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return '';
  }
}

async function requireAdmin() {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return null;

  const { data, error } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', session.user.id)
    .maybeSingle();

  if (error || !data || data.role !== 'admin') {
    await supabase.auth.signOut();
    showToast('Acesso restrito a administradores.', { error: true });
    return null;
  }
  return session;
}

async function registerPushToken(session) {
  // Sem google-services.json / Firebase, PushNotifications.register() causa crash nativo.
  if (!ENABLE_PUSH || !PushNotifications || !session) return;
  try {
    let perm = await PushNotifications.checkPermissions();
    if (perm.receive === 'prompt') {
      perm = await PushNotifications.requestPermissions();
    }
    if (perm.receive !== 'granted') return;

    PushNotifications.addListener('registration', async (token) => {
      const fcmToken = token?.value;
      if (!fcmToken) return;
      const { error } = await supabase.from('admin_push_devices').upsert(
        {
          user_id: session.user.id,
          fcm_token: fcmToken,
          platform: 'android',
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'fcm_token' }
      );
      if (error) console.warn('push upsert', error.message);
    });

    PushNotifications.addListener('registrationError', (err) => {
      console.warn('push registrationError', err);
    });

    PushNotifications.addListener('pushNotificationActionPerformed', (event) => {
      const data = event?.notification?.data || {};
      const type = String(data.type || '');
      if (type === 'visit_product' || type === 'visit_blog' || data.screen === 'metrics') {
        void openTab('metrics');
        return;
      }
      const postId = data.post_id;
      if (postId) void openPostById(postId);
    });

    await PushNotifications.register();
  } catch (err) {
    console.warn('push setup', err);
  }
}

function escapeRegExp(value) {
  return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Keep cover only in the app header; remove duplicate from HTML body. */
function stripLeadingCoverImage(html, coverUrl) {
  let body = String(html || '');
  const file = String(coverUrl || '').split('/').pop()?.split('?')[0] || '';
  if (!file) return body;

  const srcPart = escapeRegExp(file);
  const patterns = [
    new RegExp(
      `<figure[^>]*>\\s*<img[^>]+src=["'][^"']*${srcPart}[^"']*["'][^>]*/?>\\s*(?:<figcaption[\\s\\S]*?<\\/figcaption>)?\\s*<\\/figure>`,
      'i'
    ),
    new RegExp(
      `<p[^>]*>\\s*<img[^>]+src=["'][^"']*${srcPart}[^"']*["'][^>]*/?>\\s*<\\/p>`,
      'i'
    ),
    new RegExp(`<img[^>]+src=["'][^"']*${srcPart}[^"']*["'][^>]*/?>`, 'i'),
  ];

  for (const re of patterns) {
    if (re.test(body)) {
      body = body.replace(re, '');
      break;
    }
  }
  return body.replace(/^\s*(<p>\s*<\/p>\s*)+/i, '').trim();
}

function sanitizePreviewHtml(html) {
  return String(html || '')
    .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, '')
    .replace(/\son\w+\s*=\s*(['"]).*?\1/gi, '')
    .replace(/\son\w+\s*=\s*[^\s>]+/gi, '');
}

function buildPreviewBody(post) {
  // Cover/title stay above; body scrolls with them in .detail-scroll.
  return sanitizePreviewHtml(stripLeadingCoverImage(post.content_html, post.cover_url));
}

function setPreviewHtml(html) {
  const el = $('detail-preview');
  if (!el) return;
  el.innerHTML = html || '<p class="preview-loading">Sem conteúdo.</p>';
}

function renderList() {
  const list = $('posts-list');
  const empty = $('list-empty');
  if (!list) return;

  const filtered = state.posts.filter((p) => {
    if (state.filter === 'all') return true;
    return p.status === state.filter;
  });

  list.innerHTML = filtered.map((post) => {
    const cover = post.cover_url || '';
    return `
      <button type="button" class="post-card" data-id="${escapeHtml(post.id)}">
        <img src="${escapeHtml(cover)}" alt="" loading="lazy" data-fallback="1" />
        <div>
          <h2>${escapeHtml(post.title || 'Sem título')}</h2>
          <div class="row">
            <span class="badge ${escapeHtml(post.status || '')}">${escapeHtml(statusLabel(post.status))}</span>
            <span class="meta">${escapeHtml(formatDate(post.updated_at || post.created_at))}</span>
          </div>
        </div>
      </button>`;
  }).join('');

  empty.hidden = filtered.length > 0;
  list.querySelectorAll('img[data-fallback]').forEach((img) => {
    img.addEventListener('error', () => {
      img.style.opacity = '0.25';
    });
  });
  list.querySelectorAll('.post-card').forEach((btn) => {
    btn.addEventListener('click', () => {
      const post = state.posts.find((p) => p.id === btn.dataset.id);
      if (post) void openDetail(post);
    });
  });
}

async function loadPosts() {
  const { data, error } = await supabase
    .from('blog_posts')
    .select(LIST_FIELDS)
    .order('updated_at', { ascending: false })
    .limit(80);

  if (error) {
    showToast(error.message || 'Erro ao carregar posts.', { error: true });
    return;
  }
  state.posts = data || [];
  renderList();
}

async function fetchPostDetail(id) {
  const { data, error } = await supabase
    .from('blog_posts')
    .select(DETAIL_FIELDS)
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  return data;
}

async function openDetail(post) {
  showScreen('detail');
  const scrollEl = document.querySelector('#screen-detail .detail-scroll');
  if (scrollEl) scrollEl.scrollTop = 0;

  $('detail-title').textContent = post.title || 'Carregando…';
  $('detail-meta').textContent = 'Carregando pré-visualização…';
  setPreviewHtml('<p class="preview-loading">Carregando…</p>');
  $('btn-approve').disabled = true;
  $('btn-reject').disabled = true;
  $('btn-draft').disabled = true;

  let full = post;
  try {
    if (post.content_html == null) {
      full = await fetchPostDetail(post.id);
      if (!full) throw new Error('Post não encontrado.');
      state.posts = state.posts.map((p) => (p.id === full.id ? { ...p, ...full } : p));
    }
  } catch (err) {
    showToast(err.message || 'Falha ao abrir post.', { error: true });
    showScreen('list');
    return;
  }

  state.current = full;

  $('detail-title').textContent = full.title || '';
  $('detail-meta').textContent = [
    statusLabel(full.status),
    full.author_name || 'Papelê Educa',
    formatDate(full.updated_at || full.created_at),
  ].filter(Boolean).join(' · ');

  const badge = $('detail-status');
  badge.textContent = statusLabel(full.status);
  badge.className = `badge ${full.status || ''}`;

  const cover = $('detail-cover');
  if (full.cover_url) {
    cover.src = full.cover_url;
    cover.hidden = false;
  } else {
    cover.removeAttribute('src');
    cover.hidden = true;
  }

  setPreviewHtml(buildPreviewBody(full));

  const isPublished = full.status === 'published';
  $('btn-approve').hidden = isPublished;
  $('btn-draft').hidden = full.status === 'draft';
  $('btn-reject').textContent = 'Rejeitar';
  $('btn-facebook').hidden = !isPublished;
  $('action-bar')?.classList.toggle('has-facebook', isPublished);
  $('btn-approve').disabled = false;
  $('btn-reject').disabled = false;
  $('btn-draft').disabled = false;
}

async function openPostById(id) {
  let post = state.posts.find((p) => p.id === id);
  if (!post) {
    try {
      post = await fetchPostDetail(id);
    } catch (err) {
      showToast(err.message || 'Post não encontrado.', { error: true });
      return;
    }
    if (post) state.posts = [post, ...state.posts.filter((p) => p.id !== post.id)];
  }
  if (post) await openDetail(post);
}

async function setBusy(busy) {
  state.busy = busy;
  ['btn-approve', 'btn-reject', 'btn-draft', 'btn-facebook', 'login-submit', 'fb-modal-confirm'].forEach((id) => {
    const el = $(id);
    if (el) el.disabled = busy;
  });
}

async function approvePost() {
  const post = state.current;
  if (!post || state.busy) return;
  await setBusy(true);
  try {
    const now = new Date().toISOString();
    const { data, error } = await supabase
      .from('blog_posts')
      .update({ status: 'published', published_at: now, updated_at: now })
      .eq('id', post.id)
      .select(DETAIL_FIELDS)
      .maybeSingle();
    if (error) throw error;
    state.current = data;
    state.posts = state.posts.map((p) => (p.id === data.id ? data : p));
    await openDetail(data);
    showToast('Post aprovado e publicado.');
  } catch (err) {
    showToast(err.message || 'Falha ao aprovar.', { error: true });
  } finally {
    await setBusy(false);
  }
}

async function setDraft() {
  const post = state.current;
  if (!post || state.busy) return;
  await setBusy(true);
  try {
    const now = new Date().toISOString();
    const { data, error } = await supabase
      .from('blog_posts')
      .update({ status: 'draft', updated_at: now })
      .eq('id', post.id)
      .select(DETAIL_FIELDS)
      .maybeSingle();
    if (error) throw error;
    state.current = data;
    state.posts = state.posts.map((p) => (p.id === data.id ? data : p));
    await openDetail(data);
    showToast('Post voltou para rascunho.');
  } catch (err) {
    showToast(err.message || 'Falha ao alterar status.', { error: true });
  } finally {
    await setBusy(false);
  }
}

async function rejectPost() {
  const post = state.current;
  if (!post || state.busy) return;
  const ok = window.confirm(`Rejeitar e excluir permanentemente?\n\n“${post.title || 'Sem título'}”`);
  if (!ok) return;
  await setBusy(true);
  try {
    const { error } = await supabase.from('blog_posts').delete().eq('id', post.id);
    if (error) throw error;
    state.posts = state.posts.filter((p) => p.id !== post.id);
    state.current = null;
    showScreen('list');
    renderList();
    showToast('Post rejeitado e excluído.');
  } catch (err) {
    showToast(err.message || 'Falha ao rejeitar.', { error: true });
  } finally {
    await setBusy(false);
  }
}

function showLoading(text = 'Aguarde…') {
  const overlay = $('loading-overlay');
  const label = $('loading-text');
  if (label) label.textContent = text;
  if (overlay) overlay.hidden = false;
}

function hideLoading() {
  const overlay = $('loading-overlay');
  if (overlay) overlay.hidden = true;
}

function showResultModal({ type = 'success', title, message } = {}) {
  const modal = $('result-modal');
  const icon = $('result-icon');
  const titleEl = $('result-title');
  const messageEl = $('result-message');
  if (!modal) return;
  const ok = type !== 'error';
  if (icon) {
    icon.className = `result-icon ${ok ? 'success' : 'error'}`;
    icon.textContent = ok ? '✓' : '!';
  }
  if (titleEl) titleEl.textContent = title || (ok ? 'Sucesso' : 'Erro');
  if (messageEl) messageEl.textContent = message || '';
  modal.hidden = false;
}

function closeResultModal() {
  const modal = $('result-modal');
  if (modal) modal.hidden = true;
}

function openFacebookModal(post) {
  const modal = $('fb-modal');
  const titleEl = $('fb-modal-title');
  const messageEl = $('fb-modal-message');
  const errEl = $('fb-modal-error');
  if (!modal || !messageEl) return;
  titleEl.textContent = post.title || '';
  messageEl.value = [post.title, post.excerpt || post.seo_description].filter(Boolean).join('\n\n');
  errEl.hidden = true;
  errEl.textContent = '';
  modal.hidden = false;
  messageEl.focus();
}

function closeFacebookModal() {
  const modal = $('fb-modal');
  if (modal) modal.hidden = true;
}

async function confirmFacebookPost() {
  const post = state.current;
  const messageEl = $('fb-modal-message');
  const errEl = $('fb-modal-error');
  if (!post || post.status !== 'published' || state.busy) return;

  const message = String(messageEl?.value || '').trim();
  if (!message) {
    if (errEl) {
      errEl.textContent = 'Escreva uma mensagem para o post.';
      errEl.hidden = false;
    }
    return;
  }

  await setBusy(true);
  if (errEl) errEl.hidden = true;
  showLoading('Publicando no Facebook…');
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) throw new Error('Sessão expirada. Entre novamente.');

    let response;
    try {
      response = await fetch(`${SITE_URL}/api/blog/facebook-post`, {
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
    } catch {
      throw new Error(
        'Sem conexão com o servidor. Verifique a internet e se o app está atualizado.'
      );
    }
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || `HTTP ${response.status}`);

    state.current = {
      ...post,
      facebook_post_id: payload.facebook_post_id || post.facebook_post_id,
    };
    closeFacebookModal();
    showResultModal({
      type: 'success',
      title: payload.already_posted ? 'Já estava no Facebook' : 'Publicado no Facebook',
      message: payload.already_posted
        ? 'Este post já tinha uma publicação registrada na Página.'
        : 'A postagem foi enviada para a Página com sucesso.',
    });
  } catch (err) {
    showResultModal({
      type: 'error',
      title: 'Falha ao publicar',
      message: err.message || 'Não foi possível postar no Facebook.',
    });
  } finally {
    hideLoading();
    await setBusy(false);
  }
}

function postToFacebook() {
  const post = state.current;
  if (!post) {
    showToast('Abra um post primeiro.', { error: true });
    return;
  }
  if (post.status !== 'published') {
    showToast('Aprove o post antes de postar no Facebook.', { error: true });
    return;
  }
  if (state.busy) return;
  openFacebookModal(post);
}

async function enterApp(session) {
  showScreen('list');
  await loadPosts();
  // Push fica por último e só com ENABLE_PUSH (Firebase configurado).
  void registerPushToken(session).catch((err) => console.warn('push', err));
}

async function init() {
  await loadCapacitor();

  $('login-form')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const email = $('login-email').value.trim();
    const password = $('login-password').value;
    const errEl = $('login-error');
    errEl.hidden = true;
    await setBusy(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      const session = await requireAdmin();
      if (!session) {
        errEl.textContent = 'Conta sem permissão de admin.';
        errEl.hidden = false;
        return;
      }
      await enterApp(session);
    } catch (err) {
      errEl.textContent = err.message || 'Falha no login.';
      errEl.hidden = false;
    } finally {
      await setBusy(false);
    }
  });

  async function doLogout() {
    stopOnlinePoll();
    await supabase.auth.signOut();
    state.posts = [];
    state.current = null;
    state.metricsLoaded = false;
    showScreen('login');
  }

  $('btn-logout')?.addEventListener('click', () => void doLogout());
  $('btn-metrics-logout')?.addEventListener('click', () => void doLogout());

  $('btn-refresh')?.addEventListener('click', () => void loadPosts());
  $('btn-metrics-refresh')?.addEventListener('click', () => void loadMetrics());
  $('btn-back')?.addEventListener('click', () => {
    state.current = null;
    void openTab('list');
  });

  document.querySelectorAll('#bottom-nav .nav-item').forEach((btn) => {
    btn.addEventListener('click', () => {
      void openTab(btn.dataset.nav || 'list');
    });
  });
  $('btn-approve')?.addEventListener('click', () => void approvePost());
  $('btn-draft')?.addEventListener('click', () => void setDraft());
  $('btn-reject')?.addEventListener('click', () => void rejectPost());
  $('btn-facebook')?.addEventListener('click', () => postToFacebook());
  $('fb-modal-cancel')?.addEventListener('click', () => closeFacebookModal());
  $('fb-modal-confirm')?.addEventListener('click', () => void confirmFacebookPost());
  $('fb-modal')?.addEventListener('click', (event) => {
    if (event.target === $('fb-modal') && !state.busy) closeFacebookModal();
  });
  $('result-ok')?.addEventListener('click', () => closeResultModal());
  $('result-modal')?.addEventListener('click', (event) => {
    if (event.target === $('result-modal')) closeResultModal();
  });

  document.querySelectorAll('.chip').forEach((chip) => {
    chip.addEventListener('click', () => {
      document.querySelectorAll('.chip').forEach((c) => c.classList.remove('active'));
      chip.classList.add('active');
      state.filter = chip.dataset.filter || 'draft';
      renderList();
    });
  });

  if (CapacitorApp) {
    CapacitorApp.addListener('backButton', ({ canGoBack }) => {
      if (!$('screen-detail').hidden) {
        $('btn-back').click();
      } else if (!$('screen-metrics').hidden) {
        void openTab('list');
      } else if (!canGoBack) {
        CapacitorApp.exitApp();
      }
    });
  }

  const session = await requireAdmin();
  if (session) await enterApp(session);
  else showScreen('login');
}

void init();
