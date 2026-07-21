/**
 * POST /api/products/facebook-post
 * Publishes a product page link to the Facebook Page (manual action from admin).
 *
 * DELETE /api/products/facebook-post
 * Deletes the registered Facebook Page post and clears local tracking fields.
 *
 * Auth: Bearer <Supabase access_token> of an admin user
 * Body: { id: string, message?: string, force?: boolean }
 *
 * Env:
 *   SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY
 *   FACEBOOK_PAGE_ID, FACEBOOK_PAGE_ACCESS_TOKEN
 *   SITE_URL (optional, default https://papele-educa.vercel.app)
 *   FACEBOOK_GRAPH_VERSION (optional, default v21.0)
 */

function sendJson(res, statusCode, payload) {
  res.status(statusCode).setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(payload));
}

function parseBody(body) {
  if (!body) return {};
  if (typeof body === 'string') {
    try {
      return JSON.parse(body);
    } catch {
      return {};
    }
  }
  return body;
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

function extractBearer(req) {
  const header = req.headers.authorization || req.headers.Authorization || '';
  const match = String(header).match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : '';
}

function siteOrigin(req) {
  const configured = cleanSecret(process.env.SITE_URL).replace(/\/$/, '');
  if (configured) return configured;
  const proto = req.headers['x-forwarded-proto'] || 'https';
  const host = req.headers['x-forwarded-host'] || req.headers.host || 'papele-educa.vercel.app';
  return `${proto}://${host}`;
}

function buildFacebookShareLink(origin, product) {
  const url = new URL(`${origin.replace(/\/$/, '')}/produto/${encodeURIComponent(product.id)}`);
  url.searchParams.set('utm_source', 'facebook');
  url.searchParams.set('utm_medium', 'social');
  url.searchParams.set('utm_campaign', 'product');
  url.searchParams.set('utm_content', String(product.slug || product.id || ''));
  return url.toString();
}

function defaultMessage(product) {
  const title = String(product.title || '').trim();
  const description = String(product.description || '').trim();
  const excerpt = description
    ? description.replace(/\s+/g, ' ').slice(0, 280)
    : '';
  if (excerpt) return `${title}\n\n${excerpt}`;
  return title;
}

async function supabaseRequest(path, { method = 'GET', body, prefer, userToken } = {}) {
  const base = cleanSecret(process.env.SUPABASE_URL).replace(/\/$/, '');
  const serviceKey = cleanSecret(process.env.SUPABASE_SERVICE_ROLE_KEY);
  const anonKey = cleanSecret(process.env.SUPABASE_ANON_KEY);
  const key = userToken ? anonKey : serviceKey;
  if (!base || !key) {
    const err = new Error('Configure SUPABASE_URL, SUPABASE_ANON_KEY e SUPABASE_SERVICE_ROLE_KEY.');
    err.statusCode = 500;
    throw err;
  }

  const headers = {
    apikey: key,
    Authorization: `Bearer ${userToken || key}`,
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
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }

  if (!response.ok) {
    const err = new Error(
      (data && data.message) || (data && data.error) || text || `Supabase ${response.status}`
    );
    err.statusCode = response.status;
    throw err;
  }
  return data;
}

async function getAuthUser(token) {
  const base = cleanSecret(process.env.SUPABASE_URL).replace(/\/$/, '');
  const anonKey = cleanSecret(process.env.SUPABASE_ANON_KEY);
  if (!base || !anonKey) {
    const err = new Error('Configure SUPABASE_URL e SUPABASE_ANON_KEY.');
    err.statusCode = 500;
    throw err;
  }

  const response = await fetch(`${base}/auth/v1/user`, {
    headers: {
      apikey: anonKey,
      Authorization: `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    const err = new Error('Sessão inválida ou expirada.');
    err.statusCode = 401;
    throw err;
  }

  return response.json();
}

async function assertAdminFromToken(token) {
  const user = await getAuthUser(token);
  const profiles = await supabaseRequest(
    `profiles?id=eq.${encodeURIComponent(user.id)}&select=role`
  );
  const role = Array.isArray(profiles) ? profiles[0]?.role : profiles?.role;
  if (role !== 'admin') {
    const err = new Error('Apenas administradores podem postar no Facebook.');
    err.statusCode = 403;
    throw err;
  }
  return user;
}

async function publishToFacebook({ pageId, pageToken, graphVersion, message, link }) {
  const version = graphVersion || 'v21.0';
  const endpoint = `https://graph.facebook.com/${version}/${encodeURIComponent(pageId)}/feed`;
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message,
      link,
      access_token: pageToken,
    }),
  });

  const text = await response.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { raw: text };
  }

  if (!response.ok) {
    const fbMessage =
      data?.error?.message ||
      data?.error?.error_user_msg ||
      text ||
      `Facebook Graph API ${response.status}`;
    const err = new Error(fbMessage);
    err.statusCode = response.status >= 400 && response.status < 600 ? response.status : 502;
    err.facebook = data?.error || null;
    throw err;
  }

  return data;
}

async function deleteFromFacebook({ facebookPostId, pageToken, graphVersion }) {
  const version = graphVersion || 'v21.0';
  const endpoint = new URL(
    `https://graph.facebook.com/${version}/${encodeURIComponent(facebookPostId)}`
  );
  endpoint.searchParams.set('access_token', pageToken);

  const response = await fetch(endpoint.toString(), { method: 'DELETE' });
  const text = await response.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { raw: text };
  }

  if (!response.ok) {
    const code = data?.error?.code;
    const subcode = data?.error?.error_subcode;
    const alreadyGone =
      response.status === 404 ||
      code === 100 ||
      code === 803 ||
      subcode === 33;

    if (alreadyGone) {
      return { success: true, already_gone: true, facebook: data?.error || null };
    }

    const fbMessage =
      data?.error?.message ||
      data?.error?.error_user_msg ||
      text ||
      `Facebook Graph API ${response.status}`;
    const err = new Error(fbMessage);
    err.statusCode = response.status >= 400 && response.status < 600 ? response.status : 502;
    err.facebook = data?.error || null;
    throw err;
  }

  return { success: Boolean(data?.success !== false), already_gone: false };
}

async function clearFacebookFields(productId) {
  const updatedAt = new Date().toISOString();
  await supabaseRequest(`products?id=eq.${encodeURIComponent(productId)}`, {
    method: 'PATCH',
    prefer: 'return=minimal',
    body: {
      facebook_post_id: '',
      facebook_posted_at: null,
      updated_at: updatedAt,
    },
  });
  return updatedAt;
}

module.exports = async function handler(req, res) {
  if (!['POST', 'DELETE'].includes(req.method)) {
    res.setHeader('Allow', 'POST, DELETE');
    return sendJson(res, 405, { error: 'Method not allowed.' });
  }

  const token = extractBearer(req);
  if (!token) {
    return sendJson(res, 401, {
      error:
        req.method === 'DELETE'
          ? 'Faça login no admin para excluir a postagem do Facebook.'
          : 'Faça login no admin para postar no Facebook.',
    });
  }

  const pageId = cleanSecret(process.env.FACEBOOK_PAGE_ID);
  const pageToken = cleanSecret(process.env.FACEBOOK_PAGE_ACCESS_TOKEN);
  if (!pageId || !pageToken) {
    return sendJson(res, 503, {
      error:
        'Facebook não configurado. Defina FACEBOOK_PAGE_ID e FACEBOOK_PAGE_ACCESS_TOKEN na Vercel.',
      code: 'FACEBOOK_NOT_CONFIGURED',
    });
  }

  const body = parseBody(req.body);
  const productId = String(body.id || req.query?.id || '').trim();
  if (!productId) {
    return sendJson(res, 400, { error: 'Informe o id do produto.' });
  }

  try {
    await assertAdminFromToken(token);

    const rows = await supabaseRequest(
      `products?id=eq.${encodeURIComponent(productId)}&select=id,title,slug,description,status,facebook_post_id,facebook_posted_at&limit=1`
    );
    const product = Array.isArray(rows) ? rows[0] : rows;
    if (!product?.id) {
      return sendJson(res, 404, { error: 'Produto não encontrado.' });
    }

    const graphVersion = cleanSecret(process.env.FACEBOOK_GRAPH_VERSION) || 'v21.0';

    if (req.method === 'DELETE') {
      const facebookPostId = String(product.facebook_post_id || '').trim();
      if (!facebookPostId) {
        return sendJson(res, 400, {
          error: 'Este produto não tem postagem registrada no Facebook.',
          code: 'NOT_POSTED',
        });
      }

      const fbResult = await deleteFromFacebook({
        facebookPostId,
        pageToken,
        graphVersion,
      });

      await clearFacebookFields(product.id);

      return sendJson(res, 200, {
        ok: true,
        id: product.id,
        deleted_facebook_post_id: facebookPostId,
        already_gone: Boolean(fbResult.already_gone),
      });
    }

    if (product.status !== 'published') {
      return sendJson(res, 400, {
        error: 'Só é possível postar no Facebook produtos com status Publicado.',
        code: 'NOT_PUBLISHED',
      });
    }

    const alreadyPosted = Boolean(String(product.facebook_post_id || '').trim());
    const force = Boolean(body.force);
    if (alreadyPosted && !force) {
      return sendJson(res, 409, {
        error: 'Este produto já foi publicado no Facebook. Confirme para postar de novo.',
        code: 'ALREADY_POSTED',
        facebook_post_id: product.facebook_post_id,
        facebook_posted_at: product.facebook_posted_at,
      });
    }

    const origin = siteOrigin(req);
    const link = buildFacebookShareLink(origin, product);
    const message = String(body.message || defaultMessage(product)).trim();
    if (!message) {
      return sendJson(res, 400, { error: 'A mensagem do post não pode ficar vazia.' });
    }

    const fbResult = await publishToFacebook({
      pageId,
      pageToken,
      graphVersion,
      message,
      link,
    });

    const facebookPostId = String(fbResult?.id || '').trim();
    const postedAt = new Date().toISOString();

    if (facebookPostId) {
      await supabaseRequest(`products?id=eq.${encodeURIComponent(product.id)}`, {
        method: 'PATCH',
        prefer: 'return=minimal',
        body: {
          facebook_post_id: facebookPostId,
          facebook_posted_at: postedAt,
          updated_at: postedAt,
        },
      });
    }

    return sendJson(res, 200, {
      ok: true,
      id: product.id,
      slug: product.slug,
      link,
      facebook_post_id: facebookPostId,
      facebook_posted_at: postedAt,
      facebook_url: facebookPostId
        ? `https://www.facebook.com/${facebookPostId}`
        : null,
    });
  } catch (error) {
    return sendJson(res, error.statusCode || 500, {
      error: error.message || 'Erro ao postar no Facebook.',
      facebook: error.facebook || undefined,
    });
  }
};
