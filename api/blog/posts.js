/**
 * POST /api/blog/posts
 * Auth: X-API-Key === process.env.BLOG_API_KEY
 * Always creates status = 'draft' (ignores any status in body).
 *
 * Body JSON:
 * {
 *   "title": "required",
 *   "content_html" | "content": "required",
 *   "excerpt"?, "slug"?, "category"?, "tags"?: string[],
 *   "cover_url"?, "seo_title"?, "seo_description"?, "author_name"?
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

async function supabaseRequest(path, { method = 'GET', body, prefer } = {}) {
  const base = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
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

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return sendJson(res, 405, { error: 'Method not allowed.' });
  }

  const apiKey = process.env.BLOG_API_KEY;
  if (!apiKey) {
    return sendJson(res, 500, { error: 'BLOG_API_KEY não configurada no ambiente.' });
  }

  const provided = req.headers['x-api-key'] || req.headers['X-API-Key'];
  if (!provided || provided !== apiKey) {
    return sendJson(res, 401, { error: 'Unauthorized.' });
  }

  const body = parseBody(req.body);
  const title = String(body.title || '').trim();
  const contentHtml = stripScripts(String(body.content_html || body.content || '').trim());
  if (!title || !contentHtml) {
    return sendJson(res, 400, { error: 'Informe title e content_html (ou content).' });
  }

  try {
    let slug = slugify(body.slug || title) || `post-${Date.now()}`;
    const existingSlug = await supabaseRequest(
      `blog_posts?slug=eq.${encodeURIComponent(slug)}&select=id&limit=1`
    );
    if (Array.isArray(existingSlug) && existingSlug.length) {
      slug = `${slug}-${Date.now().toString(36)}`;
    }

    const categoryId = await resolveCategoryId(body.category);
    const tagIds = await resolveTagIds(Array.isArray(body.tags) ? body.tags : []);

    const payload = {
      title,
      slug,
      excerpt: String(body.excerpt || '').trim(),
      content_html: contentHtml,
      status: 'draft',
      published_at: null,
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

    return sendJson(res, 201, {
      id: post.id,
      slug: post.slug,
      status: 'draft',
      admin_url: `/admin/dashboard.html#/blog`,
    });
  } catch (error) {
    return sendJson(res, error.statusCode || 500, { error: error.message || 'Erro ao criar post.' });
  }
};
