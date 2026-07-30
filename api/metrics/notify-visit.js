/**
 * POST /api/metrics/notify-visit
 * Push FCM when a unique visitor views a product detail or blog post page.
 *
 * Body: { kind: 'product'|'blog_post', id, visitor_id, title?, source? }
 *
 * Rules:
 *   - Only product detail / blog post read pages (client calls only from those).
 *   - Unique visitor = first view ever for (visitor_id + entity), any source.
 *   - Requires a view event created within the last 5 minutes (anti-replay).
 *
 * Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, FCM_PROJECT_ID, FCM_SERVICE_ACCOUNT_JSON
 */

const crypto = require('crypto');

const RECENT_MS = 5 * 60 * 1000;

function sendJson(res, statusCode, payload) {
  res.status(statusCode).setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
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
  return raw;
}

function parseServiceAccountJson(raw) {
  if (!raw) return { account: null, error: 'missing' };
  let text = String(raw).trim();
  if (
    (text.startsWith("'") && text.endsWith("'")) ||
    (text.startsWith('"') && text.endsWith('"') && text[1] === '{')
  ) {
    text = text.slice(1, -1).trim();
  }
  const attempts = [text];
  if (text.includes('\\n') && !text.includes('\n')) {
    attempts.push(text.replace(/\\n/g, '\n'));
  }
  for (const candidate of attempts) {
    try {
      const account = JSON.parse(candidate);
      if (!account?.private_key || !account?.client_email) {
        return { account: null, error: 'missing_private_key_or_client_email' };
      }
      if (typeof account.private_key === 'string' && account.private_key.includes('\\n')) {
        account.private_key = account.private_key.replace(/\\n/g, '\n');
      }
      return { account, error: null };
    } catch {
      // try next
    }
  }
  try {
    const decoded = Buffer.from(text, 'base64').toString('utf8');
    const account = JSON.parse(decoded);
    if (account?.private_key && account?.client_email) {
      if (account.private_key.includes('\\n')) {
        account.private_key = account.private_key.replace(/\\n/g, '\n');
      }
      return { account, error: null };
    }
  } catch {
    // ignore
  }
  return { account: null, error: 'invalid_json' };
}

function base64url(input) {
  return Buffer.from(input)
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
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

async function supabaseRequest(path, { method = 'GET', body, prefer } = {}) {
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
      Prefer: prefer || 'return=representation',
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
  return { data, count: response.headers.get('content-range') };
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

function parseCountHeader(contentRange) {
  // e.g. "0-0/1" or "*/0"
  const match = String(contentRange || '').match(/\/(\d+|\*)\s*$/);
  if (!match || match[1] === '*') return null;
  return Number(match[1]);
}

async function countUniqueViews(kind, entityId, visitorId) {
  const table = kind === 'product' ? 'product_events' : 'blog_post_events';
  const idCol = kind === 'product' ? 'product_id' : 'blog_post_id';
  const path =
    `${table}?select=id,created_at` +
    `&${idCol}=eq.${encodeURIComponent(entityId)}` +
    `&visitor_id=eq.${encodeURIComponent(visitorId)}` +
    `&event_type=eq.view` +
    `&order=created_at.desc`;

  const { data, count } = await supabaseRequest(path, {
    prefer: 'count=exact',
  });
  const rows = Array.isArray(data) ? data : [];
  const total = parseCountHeader(count);
  return {
    total: total != null ? total : rows.length,
    latest: rows[0] || null,
  };
}

async function resolveTitle(kind, entityId, fallback) {
  if (fallback) return fallback;
  try {
    if (kind === 'product') {
      const { data } = await supabaseRequest(
        `products?id=eq.${encodeURIComponent(entityId)}&select=title&limit=1`
      );
      return Array.isArray(data) ? data[0]?.title : null;
    }
    const { data } = await supabaseRequest(
      `blog_posts?id=eq.${encodeURIComponent(entityId)}&select=title&limit=1`
    );
    return Array.isArray(data) ? data[0]?.title : null;
  } catch {
    return null;
  }
}

module.exports = async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    res.status(204);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.end();
    return;
  }
  if (req.method !== 'POST') {
    return sendJson(res, 405, { error: 'Method not allowed' });
  }

  try {
    const body = parseBody(req.body);
    const kindRaw = String(body.kind || body.type || '').trim().toLowerCase();
    const kind = kindRaw === 'product' || kindRaw === 'blog_post' || kindRaw === 'blog'
      ? (kindRaw === 'blog' ? 'blog_post' : kindRaw)
      : '';
    const entityId = String(body.id || body.entity_id || '').trim();
    const visitorId = String(body.visitor_id || '').trim();
    const source = String(body.source || 'site').trim() || 'site';
    const titleHint = String(body.title || '').trim();

    if (!kind || !entityId || !visitorId) {
      return sendJson(res, 400, { error: 'Informe kind (product|blog_post), id e visitor_id.' });
    }

    const { total, latest } = await countUniqueViews(kind, entityId, visitorId);
    if (total !== 1) {
      return sendJson(res, 200, { ok: true, skipped: true, reason: 'not_unique', total });
    }
    if (!latest?.created_at) {
      return sendJson(res, 200, { ok: true, skipped: true, reason: 'no_event' });
    }
    const age = Date.now() - new Date(latest.created_at).getTime();
    if (!Number.isFinite(age) || age < 0 || age > RECENT_MS) {
      return sendJson(res, 200, { ok: true, skipped: true, reason: 'stale_event' });
    }

    const { account: serviceAccount, error: saError } = parseServiceAccountJson(
      process.env.FCM_SERVICE_ACCOUNT_JSON
    );
    const projectId = cleanSecret(
      process.env.FCM_PROJECT_ID || (serviceAccount && serviceAccount.project_id) || ''
    );
    if (!serviceAccount || !projectId) {
      return sendJson(res, 200, {
        ok: true,
        skipped: true,
        reason: 'fcm_not_configured',
        detail: { serviceAccountParse: saError || 'ok' },
      });
    }

    const title = (await resolveTitle(kind, entityId, titleHint)) || 'Papelê Educa';
    const shortTitle = title.length > 100 ? `${title.slice(0, 97)}...` : title;
    const label = kind === 'product' ? 'produto' : 'post';
    const notification = {
      title: `Novo visitante · ${label}`,
      body: shortTitle,
    };
    const data = {
      type: kind === 'product' ? 'visit_product' : 'visit_blog',
      entity_id: entityId,
      visitor_id: visitorId,
      source,
      screen: 'metrics',
    };

    const { data: devices } = await supabaseRequest('admin_push_devices?select=id,fcm_token,user_id');
    const list = Array.isArray(devices) ? devices : [];
    if (!list.length) {
      return sendJson(res, 200, { ok: true, sent: 0, reason: 'no_devices' });
    }

    const accessToken = await getGoogleAccessToken(serviceAccount);
    const results = [];
    for (const device of list) {
      const result = await sendFcm(accessToken, projectId, device.fcm_token, notification, data);
      results.push({ id: device.id, ok: result.ok, status: result.status });
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
      kind,
      entity_id: entityId,
    });
  } catch (error) {
    return sendJson(res, error.statusCode || 500, {
      error: error.message || 'Erro ao notificar visita.',
    });
  }
};
