import { supabase } from './supabase-client.js';
import { trackBlogListingViewOnce } from './blog-metrics.js';

const grid = document.getElementById('blog-posts-grid');
const note = document.getElementById('blog-list-note');

void trackBlogListingViewOnce();

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

async function loadPosts() {
  if (!grid) return;
  grid.innerHTML = '<p class="empty-state">Carregando posts...</p>';

  const { data, error } = await supabase
    .from('blog_posts')
    .select('id,title,slug,excerpt,cover_url,published_at,reading_time_min,status,blog_categories(name)')
    .order('published_at', { ascending: false, nullsFirst: false });

  if (error) {
    grid.innerHTML = `<p class="empty-state">Não foi possível carregar o blog. ${escapeHtml(error.message)}</p>`;
    return;
  }

  const posts = (data || []).filter(isVisible);
  if (!posts.length) {
    grid.innerHTML = '<p class="empty-state">Em breve publicaremos os primeiros conteúdos por aqui.</p>';
    return;
  }

  grid.innerHTML = posts.map((post) => {
    const href = `/blog/${encodeURIComponent(post.slug)}`;
    const category = post.blog_categories?.name || 'Blog';
    const mins = post.reading_time_min ? `${post.reading_time_min} min` : '';
    const date = formatDate(post.published_at);
    return `
      <a class="post-card" href="${href}">
        <div class="post-card-media">
          ${post.cover_url
            ? `<img src="${escapeHtml(post.cover_url)}" alt="" width="800" height="450" />`
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
  }).join('');

  if (note) note.textContent = `${posts.length} post(s) publicados`;
}

void loadPosts();
