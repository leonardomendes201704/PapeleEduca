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

const state = {
  filter: 'draft',
  posts: [],
  current: null,
  busy: false,
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
  ['login', 'list', 'detail'].forEach((key) => {
    const el = $(`screen-${key}`);
    if (el) el.hidden = key !== name;
  });
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
      const postId = event?.notification?.data?.post_id;
      if (postId) void openPostById(postId);
    });

    await PushNotifications.register();
  } catch (err) {
    console.warn('push setup', err);
  }
}

function buildPreviewDocument(post) {
  const title = escapeHtml(post.title || '');
  const cover = post.cover_url
    ? `<img src="${escapeHtml(post.cover_url)}" alt="" style="width:100%;border-radius:12px;margin:0 0 1rem;" />`
    : '';
  const body = String(post.content_html || '');
  return `<!DOCTYPE html>
<html lang="pt-BR"><head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<style>
  body{font-family:Georgia,serif;color:#1a2e2c;line-height:1.55;margin:0;padding:1rem;background:#fff}
  h1,h2,h3{font-family:system-ui,sans-serif}
  img{max-width:100%;height:auto}
  a{color:#1a8f89}
  p{margin:0 0 0.9rem}
</style>
</head><body>
${cover}
<h1 style="font-size:1.35rem;margin:0 0 1rem;">${title}</h1>
${body}
</body></html>`;
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
  $('detail-title').textContent = post.title || 'Carregando…';
  $('detail-meta').textContent = 'Carregando pré-visualização…';
  $('detail-preview').srcdoc = '<p style="padding:1rem;font-family:sans-serif;color:#5a7370">Carregando…</p>';
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

  $('detail-preview').srcdoc = buildPreviewDocument(full);

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
    } catch (networkErr) {
      throw new Error(
        'Sem conexão com o servidor (Failed to fetch). Verifique a internet e se o app está atualizado.'
      );
    }
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || `HTTP ${response.status}`);

    state.current = {
      ...post,
      facebook_post_id: payload.facebook_post_id || post.facebook_post_id,
    };
    closeFacebookModal();
    showToast(payload.already_posted ? 'Já estava no Facebook.' : 'Postado no Facebook.');
  } catch (err) {
    if (errEl) {
      errEl.textContent = err.message || 'Falha no Facebook.';
      errEl.hidden = false;
    }
    showToast(err.message || 'Falha no Facebook.', { error: true });
  } finally {
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

  $('btn-logout')?.addEventListener('click', async () => {
    await supabase.auth.signOut();
    showScreen('login');
  });

  $('btn-refresh')?.addEventListener('click', () => void loadPosts());
  $('btn-back')?.addEventListener('click', () => {
    state.current = null;
    showScreen('list');
    renderList();
  });
  $('btn-approve')?.addEventListener('click', () => void approvePost());
  $('btn-draft')?.addEventListener('click', () => void setDraft());
  $('btn-reject')?.addEventListener('click', () => void rejectPost());
  $('btn-facebook')?.addEventListener('click', () => postToFacebook());
  $('fb-modal-cancel')?.addEventListener('click', () => closeFacebookModal());
  $('fb-modal-confirm')?.addEventListener('click', () => void confirmFacebookPost());
  $('fb-modal')?.addEventListener('click', (event) => {
    if (event.target === $('fb-modal')) closeFacebookModal();
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
