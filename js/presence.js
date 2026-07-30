import { SUPABASE_URL, SUPABASE_ANON_KEY } from './public-config.js';

const VISITOR_KEY = 'pe_visitor_id';
const SESSION_KEY = 'pe_session_id';
const HEARTBEAT_MS = 45_000;

function safeStorage(storage, key, value) {
  try {
    if (value === undefined) return storage.getItem(key);
    storage.setItem(key, value);
    return value;
  } catch {
    return null;
  }
}

function getOrCreateId(storage, key) {
  const existing = safeStorage(storage, key);
  if (existing) return existing;
  const generated = crypto.randomUUID();
  safeStorage(storage, key, generated);
  return generated;
}

function isAdminPath() {
  try {
    return /\/admin(\/|$)/i.test(window.location.pathname);
  } catch {
    return false;
  }
}

function isPreviewMode() {
  try {
    const value = new URLSearchParams(window.location.search).get('preview');
    return value === '1' || value === 'true';
  } catch {
    return false;
  }
}

async function ping() {
  if (document.visibilityState === 'hidden') return;

  const visitorId = getOrCreateId(localStorage, VISITOR_KEY);
  const sessionId = getOrCreateId(sessionStorage, SESSION_KEY);
  const now = new Date().toISOString();

  try {
    await fetch(`${SUPABASE_URL}/rest/v1/site_presence`, {
      method: 'POST',
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        'Content-Type': 'application/json',
        Prefer: 'resolution=merge-duplicates,return=minimal',
      },
      body: JSON.stringify({
        visitor_id: visitorId,
        session_id: sessionId,
        pathname: window.location.pathname || null,
        last_seen_at: now,
        updated_at: now,
      }),
      keepalive: true,
    });
  } catch {
    // ignore network errors
  }
}

function startPresence() {
  if (isAdminPath() || isPreviewMode()) return;

  void ping();
  const timer = window.setInterval(() => {
    void ping();
  }, HEARTBEAT_MS);

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') void ping();
  });

  window.addEventListener('pagehide', () => {
    window.clearInterval(timer);
  }, { once: true });
}

startPresence();
