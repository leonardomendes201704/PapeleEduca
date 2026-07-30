/**
 * POST /api/blog/posts — create post (default status draft)
 * PATCH /api/blog/posts — update by id or slug
 * DELETE /api/blog/posts — delete by id or slug
 * Auth: X-API-Key === process.env.BLOG_API_KEY
 *
 * Body JSON (POST):
 * {
 *   "title": "required",
 *   "content_html" | "content": "required",
 *   "excerpt"?, "slug"?, "category"?, "tags"?: string[],
 *   "cover_url"?, "seo_title"?, "seo_description"?, "author_name"?,
 *   "status"?, "published_at"?
 * }
 *
 * Env: BLOG_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 */

function sendJson(res, statusCode, payload) {
  res.status(statusCode).setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(payload));
}

function parseBody(body) {
  if (!body) return {};
  if (typeof body === 'string') {
    try { return JSON.parse(body); } catch { return {}; }
  }
  return body;
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

function stripScripts(html) {
  return String(html || '').replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, '');
}

function estimateReadingTime(html) {
  const text = String(html || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  const words = text ? text.split(' ').length : 0;
  return Math.max(1, Math.ceil(words / 200));
}

function cleanSecret(value) {
  let raw = String(value || '').trim().replace(/^["']|["']$/g, '');
  if (!raw) return '';
  const parts = raw.split(/\s+/).filter(Boolean);
  if (parts.length > 1 && parts.every((p) => p === parts[0])) {
    return parts[0];
  }
  return parts[0] || raw;
}

function siteOrigin(req) {
  const configured = cleanSecret(process.env.SITE_URL).replace(/\/$/, '');
  if (configured) return configured;
  const proto = req.headers['x-forwarded-proto'] || 'https';
  const host = req.headers['x-forwarded-host'] || req.headers.host || 'papele-educa.vercel.app';
  return `${proto}://${host}`;
}

/** Fire-and-forget push for new drafts (avoids broken Supabase Database Webhooks). */
function triggerDraftNotify(req, post) {
  const status = String(post?.status || '').toLowerCase();
  if (status !== 'draft' || !post?.id) return;

  const secret = cleanSecret(process.env.BLOG_NOTIFY_SECRET || process.env.CRON_SECRET);
  if (!secret) return;

  const url = `${siteOrigin(req)}/api/blog/notify-draft`;
  void fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      Authorization: `Bearer ${secret}`,
    },
    body: JSON.stringify({
      record: {
        id: post.id,
        title: post.title,
        status: post.status,
        slug: post.slug,
      },
    }),
  }).catch((err) => {
    console.warn('[blog/posts] notify-draft failed:', err?.message || err);
  });
}

async function supabaseRequest(path, { method = 'GET', body, prefer } = {}) {
  const base = cleanSecret(process.env.SUPABASE_URL).replace(/\/$/, '');
  const key = cleanSecret(process.env.SUPABASE_SERVICE_ROLE_KEY);
  if (!base || !key) {
    const err = new Error('Configure SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY.');
    err.statusCode = 500;
    throw err;
  }

  const headers = {
    apikey: key,
    Authorization: `Bearer ${key}`,
    'Content-Type': 'application/json',
  };
  if (prefer) headers.Prefer = prefer;

  const response = await fetch(`${base}/rest/v1/${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  const text = await response.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }

  if (!response.ok) {
    const err = new Error((data && data.message) || (data && data.error) || text || `Supabase ${response.status}`);
    err.statusCode = response.status;
    throw err;
  }
  return data;
}

async function resolveCategoryId(category) {
  const value = String(category || '').trim();
  if (!value) return null;
  const slug = slugify(value);

  const bySlug = await supabaseRequest(
    `blog_categories?slug=eq.${encodeURIComponent(slug)}&select=id&limit=1`
  );
  if (Array.isArray(bySlug) && bySlug[0]?.id) return bySlug[0].id;

  const byName = await supabaseRequest(
    `blog_categories?name=eq.${encodeURIComponent(value)}&select=id&limit=1`
  );
  if (Array.isArray(byName) && byName[0]?.id) return byName[0].id;

  const created = await supabaseRequest('blog_categories', {
    method: 'POST',
    prefer: 'return=representation',
    body: { name: value, slug, description: '', sort_order: 0 },
  });
  return Array.isArray(created) ? created[0]?.id : created?.id;
}

async function resolveTagIds(tagNames = []) {
  const ids = [];
  for (const raw of tagNames) {
    const name = String(raw || '').trim();
    if (!name) continue;
    const slug = slugify(name);
    const existing = await supabaseRequest(
      `blog_tags?slug=eq.${encodeURIComponent(slug)}&select=id&limit=1`
    );
    let id = Array.isArray(existing) ? existing[0]?.id : null;
    if (!id) {
      const created = await supabaseRequest('blog_tags', {
        method: 'POST',
        prefer: 'return=representation',
        body: { name, slug },
      });
      id = Array.isArray(created) ? created[0]?.id : created?.id;
    }
    if (id) ids.push(id);
  }
  return ids;
}

async function findPostId({ id, slug }) {
  if (id) return id;
  if (!slug) return null;
  const rows = await supabaseRequest(
    `blog_posts?slug=eq.${encodeURIComponent(slug)}&select=id&limit=1`
  );
  return Array.isArray(rows) ? rows[0]?.id : null;
}

function resolveStatus(body, fallback = 'draft') {
  const allowedStatus = new Set(['draft', 'published', 'scheduled', 'archived']);
  const requestedStatus = String(body.status || fallback).trim().toLowerCase();
  const status = allowedStatus.has(requestedStatus) ? requestedStatus : fallback;
  let publishedAt = null;
  if (Object.prototype.hasOwnProperty.call(body, 'published_at')) {
    publishedAt = body.published_at ? String(body.published_at) : null;
  } else if (status === 'published') {
    publishedAt = new Date().toISOString();
  }
  return { status, publishedAt };
}

module.exports = async function handler(req, res) {
  const apiKey = process.env.BLOG_API_KEY;
  if (!apiKey) {
    return sendJson(res, 500, { error: 'BLOG_API_KEY não configurada no ambiente.' });
  }

  const provided = req.headers['x-api-key'] || req.headers['X-API-Key'];
  if (!provided || provided !== apiKey) {
    return sendJson(res, 401, { error: 'Unauthorized.' });
  }

  if (!['POST', 'PATCH', 'DELETE'].includes(req.method)) {
    res.setHeader('Allow', 'POST, PATCH, DELETE');
    return sendJson(res, 405, { error: 'Method not allowed.' });
  }

  const body = parseBody(req.body);

  try {
    if (req.method === 'DELETE') {
      const postId = await findPostId(body);
      if (!postId) return sendJson(res, 400, { error: 'Informe id ou slug.' });
      await supabaseRequest(`blog_posts?id=eq.${encodeURIComponent(postId)}`, { method: 'DELETE' });
      return sendJson(res, 200, { ok: true, id: postId });
    }

    if (req.method === 'PATCH') {
      const postId = await findPostId(body);
      if (!postId) return sendJson(res, 400, { error: 'Informe id ou slug do post.' });

      const patch = { updated_at: new Date().toISOString() };
      if (body.title != null) patch.title = String(body.title).trim();
      if (body.content_html != null || body.content != null) {
        patch.content_html = stripScripts(String(body.content_html || body.content || '').trim());
        patch.reading_time_min = estimateReadingTime(patch.content_html);
      }
      if (body.excerpt != null) patch.excerpt = String(body.excerpt).trim();
      if (body.cover_url != null) patch.cover_url = String(body.cover_url).trim();
      if (body.og_image_url != null || body.cover_url != null) {
        patch.og_image_url = String(body.og_image_url || body.cover_url || '').trim();
      }
      if (body.seo_title != null) patch.seo_title = String(body.seo_title).trim();
      if (body.seo_description != null) patch.seo_description = String(body.seo_description).trim();
      if (body.author_name != null) patch.author_name = String(body.author_name).trim();
      if (body.category != null) patch.category_id = await resolveCategoryId(body.category);
      if (body.category_slug != null) {
        const rows = await supabaseRequest(
          `blog_categories?slug=eq.${encodeURIComponent(slugify(body.category_slug))}&select=id&limit=1`
        );
        if (Array.isArray(rows) && rows[0]?.id) patch.category_id = rows[0].id;
      }
      if (body.status != null) {
        const { status, publishedAt } = resolveStatus(body, 'draft');
        patch.status = status;
        if (publishedAt !== null || status === 'published') patch.published_at = publishedAt;
      } else if (Object.prototype.hasOwnProperty.call(body, 'published_at')) {
        patch.published_at = body.published_at ? String(body.published_at) : null;
      }

      const updated = await supabaseRequest(`blog_posts?id=eq.${encodeURIComponent(postId)}`, {
        method: 'PATCH',
        prefer: 'return=representation',
        body: patch,
      });
      const post = Array.isArray(updated) ? updated[0] : updated;
      return sendJson(res, 200, { id: postId, slug: post?.slug, status: post?.status });
    }

    // POST create
    const title = String(body.title || '').trim();
    const contentHtml = stripScripts(String(body.content_html || body.content || '').trim());
    if (!title || !contentHtml) {
      return sendJson(res, 400, { error: 'Informe title e content_html (ou content).' });
    }

    let slug = slugify(body.slug || title) || `post-${Date.now()}`;
    const existingSlug = await supabaseRequest(
      `blog_posts?slug=eq.${encodeURIComponent(slug)}&select=id&limit=1`
    );
    if (Array.isArray(existingSlug) && existingSlug.length) {
      slug = `${slug}-${Date.now().toString(36)}`;
    }

    const categoryId = await resolveCategoryId(body.category);
    const tagIds = await resolveTagIds(Array.isArray(body.tags) ? body.tags : []);
    const { status, publishedAt } = resolveStatus(body, 'draft');

    const payload = {
      title,
      slug,
      excerpt: String(body.excerpt || '').trim(),
      content_html: contentHtml,
      status,
      published_at: publishedAt,
      cover_url: String(body.cover_url || '').trim(),
      og_image_url: String(body.og_image_url || body.cover_url || '').trim(),
      seo_title: String(body.seo_title || title).trim(),
      seo_description: String(body.seo_description || body.excerpt || '').trim(),
      author_name: String(body.author_name || 'Papelê Educa').trim(),
      reading_time_min: estimateReadingTime(contentHtml),
      category_id: categoryId,
    };

    const created = await supabaseRequest('blog_posts', {
      method: 'POST',
      prefer: 'return=representation',
      body: payload,
    });
    const post = Array.isArray(created) ? created[0] : created;
    if (!post?.id) throw new Error('Falha ao criar post.');

    if (tagIds.length) {
      await supabaseRequest('blog_post_tags', {
        method: 'POST',
        prefer: 'return=minimal',
        body: tagIds.map((tag_id) => ({ post_id: post.id, tag_id })),
      });
    }

    triggerDraftNotify(req, post);

    return sendJson(res, 201, {
      id: post.id,
      slug: post.slug,
      status: post.status || status,
      admin_url: `/admin/dashboard.html#/blog`,
    });
  } catch (error) {
    return sendJson(res, error.statusCode || 500, { error: error.message || 'Erro na API de posts.' });
  }
};
