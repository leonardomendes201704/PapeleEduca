/**
 * POST /api/metrics/presence
 * Heartbeat from the public site. Upserts site_presence with service role
 * so RLS on anon inserts cannot block the ping.
 *
 * Body: { visitor_id, session_id?, pathname? }
 * Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 */

function sendJson(res, statusCode, payload) {
  res.status(statusCode).setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
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

function isSafeId(value) {
  const text = String(value || '').trim();
  return text.length >= 8 && text.length <= 80 && /^[a-zA-Z0-9_-]+$/.test(text);
}

module.exports = async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    res.status(204);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.end();
    return;
  }
  if (req.method !== 'POST') {
    return sendJson(res, 405, { error: 'Method not allowed' });
  }

  try {
    const body = parseBody(req.body);
    const visitorId = String(body.visitor_id || '').trim();
    const sessionId = String(body.session_id || visitorId).trim();
    let pathname = String(body.pathname || '').trim().slice(0, 300);
    if (!pathname.startsWith('/')) pathname = '/';

    if (!isSafeId(visitorId) || !isSafeId(sessionId)) {
      return sendJson(res, 400, { error: 'visitor_id/session_id inválidos.' });
    }

    const base = cleanSecret(process.env.SUPABASE_URL).replace(/\/$/, '');
    const key = cleanSecret(process.env.SUPABASE_SERVICE_ROLE_KEY);
    if (!base || !key) {
      return sendJson(res, 500, { error: 'Supabase não configurado.' });
    }

    const now = new Date().toISOString();
    const response = await fetch(`${base}/rest/v1/site_presence`, {
      method: 'POST',
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
        Prefer: 'resolution=merge-duplicates,return=minimal',
      },
      body: JSON.stringify({
        visitor_id: visitorId,
        session_id: sessionId,
        pathname,
        last_seen_at: now,
        updated_at: now,
      }),
    });

    if (!response.ok) {
      const text = await response.text().catch(() => '');
      return sendJson(res, 502, {
        error: 'Falha ao registrar presença.',
        detail: text.slice(0, 300),
      });
    }

    return sendJson(res, 200, { ok: true });
  } catch (error) {
    return sendJson(res, 500, { error: error.message || 'Erro de presença.' });
  }
};
