/**
 * POST /api/blog/notify-draft
 * Called by Supabase Database Webhook on INSERT into blog_posts (draft).
 * Sends FCM push to all admin_push_devices tokens.
 *
 * Auth (one of):
 *   - Authorization: Bearer <CRON_SECRET or BLOG_NOTIFY_SECRET>
 *   - Authorization: Bearer <Supabase admin access_token>
 * Body: Supabase webhook payload { type, table, record, ... } or { id, title, status, slug }
 *
 * Env:
 *   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_ANON_KEY
 *   CRON_SECRET or BLOG_NOTIFY_SECRET
 *   FCM_PROJECT_ID
 *   FCM_SERVICE_ACCOUNT_JSON  (stringified service account JSON)
 *
 * Note: Database Webhooks may fail on projects without schema supabase_functions.
 * Prefer calling this API from /api/blog/posts or the admin after creating a draft.
 */

const crypto = require('crypto');

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

async function assertAdminToken(token) {
  const base = cleanSecret(process.env.SUPABASE_URL).replace(/\/$/, '');
  const anonKey = cleanSecret(process.env.SUPABASE_ANON_KEY);
  if (!base || !anonKey) return false;

  const userRes = await fetch(`${base}/auth/v1/user`, {
    headers: {
      apikey: anonKey,
      Authorization: `Bearer ${token}`,
    },
  });
  if (!userRes.ok) return false;
  const user = await userRes.json();
  if (!user?.id) return false;

  const profiles = await supabaseRequest(
    `profiles?id=eq.${encodeURIComponent(user.id)}&select=role&limit=1`
  );
  const role = Array.isArray(profiles) ? profiles[0]?.role : profiles?.role;
  return role === 'admin';
}

async function authorizeNotify(req) {
  const token = extractBearer(req);
  if (!token) {
    const err = new Error('Unauthorized');
    err.statusCode = 401;
    throw err;
  }
  const expected = cleanSecret(process.env.BLOG_NOTIFY_SECRET || process.env.CRON_SECRET);
  if (expected && token === expected) return { mode: 'secret' };
  if (await assertAdminToken(token)) return { mode: 'admin' };
  const err = new Error('Unauthorized');
  err.statusCode = 401;
  throw err;
}

function base64url(input) {
  return Buffer.from(input)
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

function getServiceAccount() {
  const raw = cleanSecret(process.env.FCM_SERVICE_ACCOUNT_JSON);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    try {
      return JSON.parse(Buffer.from(raw, 'base64').toString('utf8'));
    } catch {
      return null;
    }
  }
}

async function getGoogleAccessToken(serviceAccount) {
  const now = Math.floor(Date.now() / 1000);
  const header = base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claim = base64url(
    JSON.stringify({
      iss: serviceAccount.client_email,
      scope: 'https://www.googleapis.com/auth/firebase.messaging',
      aud: 'https://oauth2.googleapis.com/token',
      iat: now,
      exp: now + 3600,
    })
  );
  const unsigned = `${header}.${claim}`;
  const sign = crypto.createSign('RSA-SHA256');
  sign.update(unsigned);
  sign.end();
  const signature = sign
    .sign(serviceAccount.private_key)
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
  const jwt = `${unsigned}.${signature}`;

  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt,
    }),
  });
  const tokenData = await tokenRes.json().catch(() => ({}));
  if (!tokenRes.ok || !tokenData.access_token) {
    const err = new Error(tokenData.error_description || tokenData.error || 'Falha ao obter token FCM');
    err.statusCode = 502;
    throw err;
  }
  return tokenData.access_token;
}

async function supabaseRequest(path, { method = 'GET', body } = {}) {
  const base = cleanSecret(process.env.SUPABASE_URL).replace(/\/$/, '');
  const key = cleanSecret(process.env.SUPABASE_SERVICE_ROLE_KEY);
  if (!base || !key) {
    const err = new Error('Configure SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY.');
    err.statusCode = 500;
    throw err;
  }
  const response = await fetch(`${base}/rest/v1/${path}`, {
    method,
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
    },
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
    const err = new Error((data && data.message) || text || `Supabase ${response.status}`);
    err.statusCode = response.status;
    throw err;
  }
  return data;
}

async function sendFcm(accessToken, projectId, token, notification, data) {
  const url = `https://fcm.googleapis.com/v1/projects/${encodeURIComponent(projectId)}/messages:send`;
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      message: {
        token,
        notification,
        data,
        android: {
          priority: 'HIGH',
          notification: { channel_id: 'blog_moderation', sound: 'default' },
        },
      },
    }),
  });
  const payload = await response.json().catch(() => ({}));
  return { ok: response.ok, status: response.status, payload };
}

function extractRecord(body) {
  if (body.record && typeof body.record === 'object') return body.record;
  if (body.new && typeof body.new === 'object') return body.new;
  return body;
}

module.exports = async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }
  if (req.method !== 'POST') {
    return sendJson(res, 405, { error: 'Method not allowed' });
  }

  try {
    await authorizeNotify(req);
    const body = parseBody(req.body);
    const record = extractRecord(body);
    const status = String(record.status || '').toLowerCase();
    const title = String(record.title || 'Novo post').trim();
    const postId = String(record.id || '').trim();
    const slug = String(record.slug || '').trim();

    // Only notify for drafts (moderation queue). Ignore other statuses.
    if (status && status !== 'draft') {
      return sendJson(res, 200, { ok: true, skipped: true, reason: 'not_draft' });
    }
    if (!postId) {
      return sendJson(res, 400, { error: 'Informe id do post.' });
    }

    const serviceAccount = getServiceAccount();
    const projectId = cleanSecret(process.env.FCM_PROJECT_ID || (serviceAccount && serviceAccount.project_id));
    if (!serviceAccount || !projectId) {
      return sendJson(res, 200, {
        ok: true,
        skipped: true,
        reason: 'fcm_not_configured',
        hint: 'Defina FCM_PROJECT_ID e FCM_SERVICE_ACCOUNT_JSON na Vercel.',
      });
    }

    const devices = await supabaseRequest(
      'admin_push_devices?select=id,fcm_token,user_id'
    );
    const list = Array.isArray(devices) ? devices : [];
    if (!list.length) {
      return sendJson(res, 200, { ok: true, sent: 0, reason: 'no_devices' });
    }

    const accessToken = await getGoogleAccessToken(serviceAccount);
    const notification = {
      title: 'Novo rascunho no blog',
      body: title.length > 120 ? `${title.slice(0, 117)}...` : title,
    };
    const data = {
      post_id: postId,
      slug,
      status: 'draft',
      type: 'blog_draft',
    };

    const results = [];
    for (const device of list) {
      const result = await sendFcm(accessToken, projectId, device.fcm_token, notification, data);
      results.push({ id: device.id, ok: result.ok, status: result.status });
      // Drop invalid tokens
      if (
        !result.ok &&
        (result.payload?.error?.details || []).some((d) =>
          String(d.errorCode || d['@type'] || '').includes('UNREGISTERED')
        )
      ) {
        await supabaseRequest(`admin_push_devices?id=eq.${encodeURIComponent(device.id)}`, {
          method: 'DELETE',
        }).catch(() => null);
      }
    }

    return sendJson(res, 200, {
      ok: true,
      sent: results.filter((r) => r.ok).length,
      total: results.length,
      post_id: postId,
    });
  } catch (error) {
    return sendJson(res, error.statusCode || 500, {
      error: error.message || 'Erro ao notificar.',
    });
  }
};
