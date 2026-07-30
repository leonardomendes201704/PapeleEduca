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

  try {
    // Use site API (service role) — direct anon upsert hits RLS 401 on this project.
    await fetch('/api/metrics/presence', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        visitor_id: visitorId,
        session_id: sessionId,
        pathname: window.location.pathname || '/',
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
