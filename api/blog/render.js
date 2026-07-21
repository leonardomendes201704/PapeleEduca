/**
 * Server-rendered blog post for Open Graph / social previews.
 * /blog/:slug → rewrite → /api/blog/render?slug=:slug
 */

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function stripScripts(html) {
  return String(html || '').replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, '');
}

function sendHtml(res, statusCode, html) {
  res.status(statusCode).setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=300');
  res.end(html);
}

/** Normalize env keys that were pasted twice or wrapped in quotes. */
function cleanSecret(value) {
  let raw = String(value || '').trim().replace(/^["']|["']$/g, '');
  if (!raw) return '';
  const parts = raw.split(/\s+/).filter(Boolean);
  if (parts.length > 1 && parts.every((p) => p === parts[0])) {
    return parts[0];
  }
  return parts[0] || raw;
}

async function fetchVisiblePost(slug) {
  const base = cleanSecret(process.env.SUPABASE_URL).replace(/\/$/, '');
  const key = cleanSecret(process.env.SUPABASE_ANON_KEY)
    || cleanSecret(process.env.SUPABASE_SERVICE_ROLE_KEY);
  if (!base || !key) return null;

  const now = new Date().toISOString();
  const url = `${base}/rest/v1/blog_posts?slug=eq.${encodeURIComponent(slug)}&select=*,blog_categories(name)&limit=1`;
  const response = await fetch(url, {
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
    },
  });
  if (!response.ok) return null;
  const rows = await response.json();
  const post = Array.isArray(rows) ? rows[0] : null;
  if (!post) return null;
  const visible =
    post.status === 'published' ||
    (post.status === 'scheduled' && post.published_at && new Date(post.published_at) <= new Date(now));
  return visible ? post : null;
}

function renderPage(post, siteOrigin) {
  const title = post.seo_title || post.title;
  const description = post.seo_description || post.excerpt || '';
  const image = post.og_image_url || post.cover_url || `${siteOrigin}/images/blog-brincar-bncc-og.jpg`;
  const url = `${siteOrigin}/blog/${encodeURIComponent(post.slug)}`;
  const category = post.blog_categories?.name || 'Blog';
  const date = post.published_at
    ? new Date(post.published_at).toLocaleDateString('pt-BR', { day: 'numeric', month: 'long', year: 'numeric' })
    : '';

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escapeHtml(title)} | Papelê Educa</title>
  <meta name="description" content="${escapeHtml(description)}" />
  <link rel="canonical" href="${escapeHtml(url)}" />
  <meta property="og:type" content="article" />
  <meta property="og:site_name" content="Papelê Educa" />
  <meta property="og:locale" content="pt_BR" />
  <meta property="og:url" content="${escapeHtml(url)}" />
  <meta property="og:title" content="${escapeHtml(title)}" />
  <meta property="og:description" content="${escapeHtml(description)}" />
  <meta property="og:image" content="${escapeHtml(image)}" />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="${escapeHtml(title)}" />
  <meta name="twitter:description" content="${escapeHtml(description)}" />
  <meta name="twitter:image" content="${escapeHtml(image)}" />
  <link rel="stylesheet" href="/css/blog-article.css" />
</head>
<body>
  <main class="page">
    <header class="topbar">
      <a class="brand" href="/index.html" aria-label="Papelê Educa">
        <div class="brand-mark"><img src="/images/logo-header.png" alt="Papelê Educa" /></div>
      </a>
      <nav class="nav" aria-label="Navegação principal">
        <a href="/index.html">Início</a>
        <a href="/index.html#categorias">Materiais</a>
        <a href="/index.html#materiais-gratuitos">Gratuitos</a>
        <a class="active" href="/blog.html" data-nav-item="blog">Blog</a>
        <a href="/index.html#contato">Contato</a>
      </nav>
      <a class="btn" href="/index.html#categorias">Explorar materiais</a>
    </header>

    <article class="article" data-blog-post-id="${escapeHtml(post.id)}">
      ${post.cover_url ? `<div class="article-cover"><img src="${escapeHtml(post.cover_url)}" alt="" /></div>` : ''}
      <div class="article-body">
        <nav class="breadcrumb"><a href="/blog.html">Blog</a> / <span>${escapeHtml(category)}</span></nav>
        <span class="article-tag">${escapeHtml(category)}</span>
        <div class="article-meta">
          ${date ? `<span><time datetime="${escapeHtml(post.published_at)}">${escapeHtml(date)}</time></span>` : ''}
          ${post.reading_time_min ? `<span>Leitura aproximada: ${escapeHtml(post.reading_time_min)} min</span>` : ''}
          <span>${escapeHtml(post.author_name || 'Papelê Educa')}</span>
        </div>
        <h1>${escapeHtml(post.title)}</h1>
        ${post.excerpt ? `<p class="lead">${escapeHtml(post.excerpt)}</p>` : ''}
        <div class="article-content">${stripScripts(post.content_html || '')}</div>
      </div>
    </article>
  </main>
  <script type="module" src="/js/blog-nav.js"></script>
  <script type="module" src="/js/blog-metrics.js"></script>
  <script type="module" src="/js/blog-product-recs.js"></script>
</body>
</html>`;
}

module.exports = async function handler(req, res) {
  const slug = String(req.query?.slug || '').trim();
  if (!slug) {
    return sendHtml(res, 400, '<!DOCTYPE html><html><body><h1>Slug obrigatório</h1></body></html>');
  }

  try {
    const post = await fetchVisiblePost(slug);
    if (!post) {
      return sendHtml(res, 404, '<!DOCTYPE html><html lang="pt-BR"><body><h1>Post não encontrado</h1><p><a href="/blog.html">Voltar ao blog</a></p></body></html>');
    }
    const proto = req.headers['x-forwarded-proto'] || 'https';
    const host = req.headers['x-forwarded-host'] || req.headers.host || 'papele-educa.vercel.app';
    const origin = `${proto}://${host}`;
    return sendHtml(res, 200, renderPage(post, origin));
  } catch (error) {
    return sendHtml(res, 500, `<!DOCTYPE html><html><body><h1>Erro</h1><p>${escapeHtml(error.message)}</p></body></html>`);
  }
};
