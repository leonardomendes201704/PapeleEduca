import { supabase } from './supabase-client.js';
import { trackBlogListingViewOnce } from './blog-metrics.js';

const PAGE_SIZE = 5;

const grid = document.getElementById('blog-posts-grid');
const note = document.getElementById('blog-list-note');
const sentinel = document.getElementById('blog-infinite-sentinel');

void trackBlogListingViewOnce();

let offset = 0;
let loading = false;
let hasMore = true;
let totalLoaded = 0;
let observer = null;

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  })[char]);
}

function formatDate(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('pt-BR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

function isVisible(post) {
  if (post.status === 'published') return true;
  if (post.status === 'scheduled' && post.published_at) {
    return new Date(post.published_at) <= new Date();
  }
  return false;
}

function setNote(text) {
  if (note) note.textContent = text || '';
}

function renderPostCard(post) {
  const href = `/blog/${encodeURIComponent(post.slug)}`;
  const category = post.blog_categories?.name || 'Blog';
  const mins = post.reading_time_min ? `${post.reading_time_min} min` : '';
  const date = formatDate(post.published_at);
  return `
    <a class="post-card" href="${href}">
      <div class="post-card-media">
        ${post.cover_url
          ? `<img src="${escapeHtml(post.cover_url)}" alt="" width="800" height="450" loading="lazy" />`
          : ''}
      </div>
      <div class="post-card-body">
        <span class="post-card-tag">${escapeHtml(category)}</span>
        <span class="post-card-meta">${escapeHtml([date, mins].filter(Boolean).join(' · '))}</span>
        <h2>${escapeHtml(post.title)}</h2>
        <p>${escapeHtml(post.excerpt || '')}</p>
        <span class="post-card-link">Ler matéria →</span>
      </div>
    </a>
  `;
}

function appendPosts(posts) {
  const html = posts.map(renderPostCard).join('');
  if (!totalLoaded) {
    grid.innerHTML = html;
  } else {
    grid.insertAdjacentHTML('beforeend', html);
  }
  totalLoaded += posts.length;
}

async function loadNextPage() {
  if (!grid || loading || !hasMore) return;

  loading = true;
  setNote(totalLoaded ? 'Carregando mais posts...' : 'Carregando posts...');

  const { data, error } = await supabase
    .from('blog_posts')
    .select('id,title,slug,excerpt,cover_url,published_at,reading_time_min,status,blog_categories(name)')
    .eq('status', 'published')
    .order('published_at', { ascending: false, nullsFirst: false })
    .range(offset, offset + PAGE_SIZE - 1);

  if (error) {
    if (!totalLoaded) {
      grid.innerHTML = `<p class="empty-state">Não foi possível carregar o blog. ${escapeHtml(error.message)}</p>`;
    }
    setNote('Não foi possível carregar mais posts.');
    loading = false;
    hasMore = false;
    observer?.disconnect();
    return;
  }

  const posts = (data || []).filter(isVisible);

  if (!posts.length) {
    if (!totalLoaded) {
      grid.innerHTML = '<p class="empty-state">Em breve publicaremos os primeiros conteúdos por aqui.</p>';
      setNote('');
    } else {
      setNote(`${totalLoaded} post(s) publicados`);
    }
    hasMore = false;
    loading = false;
    observer?.disconnect();
    return;
  }

  appendPosts(posts);
  offset += (data || []).length;
  hasMore = (data || []).length === PAGE_SIZE;

  setNote(
    hasMore
      ? `${totalLoaded} post(s) carregados · role para ver mais`
      : `${totalLoaded} post(s) publicados`
  );

  loading = false;

  if (!hasMore) {
    observer?.disconnect();
  }
}

function setupInfiniteScroll() {
  if (!sentinel || typeof IntersectionObserver !== 'function') {
    void loadNextPage();
    return;
  }

  observer = new IntersectionObserver(
    (entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        void loadNextPage();
      }
    },
    {
      root: null,
      rootMargin: '240px 0px',
      threshold: 0,
    }
  );

  observer.observe(sentinel);
  void loadNextPage();
}

setupInfiniteScroll();
