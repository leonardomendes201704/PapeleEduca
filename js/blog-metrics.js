import { SUPABASE_URL, SUPABASE_ANON_KEY } from './public-config.js';

const VISITOR_KEY = 'pe_visitor_id';
const SESSION_KEY = 'pe_session_id';
const VIEW_PREFIX = 'pe_blog_viewed_';
const READ_PREFIX = 'pe_blog_read_';
const LISTING_VIEW_KEY = 'pe_blog_listing_viewed';
const MIN_READ_MS = 20_000;
const SCROLL_THRESHOLD = 0.9;

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

function getVisitorId() {
  return getOrCreateId(localStorage, VISITOR_KEY);
}

function getSessionId() {
  return getOrCreateId(sessionStorage, SESSION_KEY);
}

function commonMeta(metadata = {}) {
  return {
    viewport: {
      width: window.innerWidth,
      height: window.innerHeight,
    },
    language: navigator.language || null,
    ...metadata,
  };
}

async function postEvent(table, payload) {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
    method: 'POST',
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'return=minimal',
    },
    body: JSON.stringify([payload]),
    keepalive: true,
  });
  return response.ok;
}

async function sendBlogEvent(blogPostId, eventType, metadata = {}) {
  if (!blogPostId || !eventType) return false;

  return postEvent('blog_post_events', {
    blog_post_id: blogPostId,
    event_type: eventType,
    visitor_id: getVisitorId(),
    session_id: getSessionId(),
    source: metadata.source || 'site',
    pathname: metadata.pathname || window.location.pathname,
    referrer: metadata.referrer || document.referrer || null,
    metadata: commonMeta(metadata),
  });
}

export function trackBlogListingViewOnce(metadata = {}) {
  if (safeStorage(sessionStorage, LISTING_VIEW_KEY)) return Promise.resolve(false);
  safeStorage(sessionStorage, LISTING_VIEW_KEY, '1');
  return postEvent('blog_listing_events', {
    event_type: 'view',
    visitor_id: getVisitorId(),
    session_id: getSessionId(),
    source: metadata.source || 'site',
    pathname: metadata.pathname || window.location.pathname,
    referrer: metadata.referrer || document.referrer || null,
    metadata: commonMeta(metadata),
  }).catch(() => false);
}

function trackBlogViewOnce(blogPostId) {
  if (!blogPostId) return Promise.resolve(false);
  const key = `${VIEW_PREFIX}${blogPostId}`;
  if (safeStorage(sessionStorage, key)) return Promise.resolve(false);
  safeStorage(sessionStorage, key, '1');
  return sendBlogEvent(blogPostId, 'view').catch(() => false);
}

function trackBlogReadOnce(blogPostId, metadata = {}) {
  if (!blogPostId) return Promise.resolve(false);
  const key = `${READ_PREFIX}${blogPostId}`;
  if (safeStorage(sessionStorage, key)) return Promise.resolve(false);
  safeStorage(sessionStorage, key, '1');
  return sendBlogEvent(blogPostId, 'read_complete', metadata).catch(() => false);
}

function getScrollProgress() {
  const doc = document.documentElement;
  const body = document.body;
  const scrollTop = window.scrollY || doc.scrollTop || body.scrollTop || 0;
  const scrollHeight = Math.max(doc.scrollHeight, body.scrollHeight);
  const clientHeight = doc.clientHeight || window.innerHeight || 1;
  const maxScroll = Math.max(scrollHeight - clientHeight, 1);
  return Math.min(1, scrollTop / maxScroll);
}

function initBlogReadTracking(blogPostId) {
  let scrolled90 = false;
  let timeOk = false;
  let sent = false;

  const maybeComplete = () => {
    if (sent || !scrolled90 || !timeOk) return;
    sent = true;
    void trackBlogReadOnce(blogPostId, {
      scroll_progress: getScrollProgress(),
      dwell_ms: MIN_READ_MS,
    });
  };

  const onScroll = () => {
    if (getScrollProgress() >= SCROLL_THRESHOLD) {
      scrolled90 = true;
      maybeComplete();
      window.removeEventListener('scroll', onScroll, { passive: true });
    }
  };

  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  window.setTimeout(() => {
    timeOk = true;
    maybeComplete();
  }, MIN_READ_MS);
}

function boot() {
  const article = document.querySelector('[data-blog-post-id]');
  const blogPostId = article?.getAttribute('data-blog-post-id');
  if (!blogPostId) return;

  void trackBlogViewOnce(blogPostId);
  initBlogReadTracking(blogPostId);
}

boot();
