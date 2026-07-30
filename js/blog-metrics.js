import { SUPABASE_URL, SUPABASE_ANON_KEY } from './public-config.js';

const VISITOR_KEY = 'pe_visitor_id';
const SESSION_KEY = 'pe_session_id';
const VIEW_PREFIX = 'pe_blog_viewed_';
const READ_PREFIX = 'pe_blog_read_';
const LISTING_VIEW_KEY = 'pe_blog_listing_viewed';
const MIN_READ_MS = 20_000;
const SCROLL_THRESHOLD = 0.9;
const CAMPAIGN_KEYS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content'];

/** Admin preview (?preview=1) must not pollute views / read_completes. */
function isPreviewMode() {
  try {
    const value = new URLSearchParams(window.location.search).get('preview');
    return value === '1' || value === 'true';
  } catch {
    return false;
  }
}

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

function getCampaignParams() {
  const params = new URLSearchParams(window.location.search);
  return CAMPAIGN_KEYS.reduce((acc, key) => {
    const value = params.get(key);
    if (value) acc[key] = value;
    return acc;
  }, {});
}

function isFacebookReferrer(referrer) {
  const ref = String(referrer || '').toLowerCase();
  return (
    ref.includes('facebook.com') ||
    ref.includes('fb.com') ||
    ref.includes('fb.me') ||
    ref.includes('l.facebook.com') ||
    ref.includes('m.facebook.com') ||
    ref.includes('lm.facebook.com')
  );
}

function hasFacebookClickId() {
  try {
    return new URLSearchParams(window.location.search).has('fbclid');
  } catch {
    return false;
  }
}

function resolveTrafficSource(metadata = {}) {
  const campaign = getCampaignParams();
  const utmSource = String(campaign.utm_source || '').trim().toLowerCase();
  if (utmSource) return utmSource;

  if (hasFacebookClickId()) return 'facebook';

  const referrer = metadata.referrer || document.referrer || '';
  if (isFacebookReferrer(referrer)) return 'facebook';

  const explicit = String(metadata.source || '').trim().toLowerCase();
  const pageContexts = new Set(['site', 'home', 'product_page', 'related', 'blog', 'listing', '']);
  if (explicit && !pageContexts.has(explicit)) return explicit;

  return 'site';
}

function commonMeta(metadata = {}) {
  return {
    viewport: {
      width: window.innerWidth,
      height: window.innerHeight,
    },
    language: navigator.language || null,
    ...metadata,
    // URL campaign params win over any metadata defaults
    ...getCampaignParams(),
    ...(hasFacebookClickId() ? { fbclid: true } : {}),
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

function notifyUniqueVisit({ kind, id, visitorId, title, source }) {
  if (!kind || !id || !visitorId) return;
  try {
    void fetch('/api/metrics/notify-visit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        kind,
        id,
        visitor_id: visitorId,
        title: title || undefined,
        source: source || undefined,
      }),
      keepalive: true,
    }).catch(() => {});
  } catch {
    // ignore
  }
}

async function sendBlogEvent(blogPostId, eventType, metadata = {}) {
  if (!blogPostId || !eventType) return false;

  const referrer = metadata.referrer || document.referrer || null;
  const source = resolveTrafficSource({ ...metadata, referrer });

  return postEvent('blog_post_events', {
    blog_post_id: blogPostId,
    event_type: eventType,
    visitor_id: getVisitorId(),
    session_id: getSessionId(),
    source,
    pathname: metadata.pathname || window.location.pathname,
    referrer,
    metadata: commonMeta({ ...metadata, referrer }),
  });
}

export function trackBlogListingViewOnce(metadata = {}) {
  if (isPreviewMode()) return Promise.resolve(false);
  const referrer = metadata.referrer || document.referrer || null;
  const source = resolveTrafficSource({ ...metadata, referrer });
  const listingKey = `${LISTING_VIEW_KEY}_${source}`;
  if (safeStorage(sessionStorage, listingKey)) return Promise.resolve(false);
  safeStorage(sessionStorage, listingKey, '1');
  return postEvent('blog_listing_events', {
    event_type: 'view',
    visitor_id: getVisitorId(),
    session_id: getSessionId(),
    source,
    pathname: metadata.pathname || window.location.pathname,
    referrer,
    metadata: commonMeta({ ...metadata, referrer }),
  }).catch(() => false);
}

function trackBlogViewOnce(blogPostId, metadata = {}) {
  if (!blogPostId || isPreviewMode()) return Promise.resolve(false);
  const source = resolveTrafficSource(metadata);
  // Deduplicate per source so a prior site visit in the same tab
  // does not hide a later Facebook / UTM landing.
  const key = `${VIEW_PREFIX}${blogPostId}_${source}`;
  if (safeStorage(sessionStorage, key)) return Promise.resolve(false);
  return sendBlogEvent(blogPostId, 'view', metadata)
    .then((ok) => {
      if (ok) {
        safeStorage(sessionStorage, key, '1');
        notifyUniqueVisit({
          kind: 'blog_post',
          id: blogPostId,
          visitorId: getVisitorId(),
          title: metadata.title,
          source,
        });
      }
      return ok;
    })
    .catch(() => false);
}

function trackBlogReadOnce(blogPostId, metadata = {}) {
  if (!blogPostId || isPreviewMode()) return Promise.resolve(false);
  const source = resolveTrafficSource(metadata);
  const key = `${READ_PREFIX}${blogPostId}_${source}`;
  if (safeStorage(sessionStorage, key)) return Promise.resolve(false);
  return sendBlogEvent(blogPostId, 'read_complete', metadata)
    .then((ok) => {
      if (ok) safeStorage(sessionStorage, key, '1');
      return ok;
    })
    .catch(() => false);
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
  if (isPreviewMode()) return;

  const article = document.querySelector('[data-blog-post-id]');
  const blogPostId = article?.getAttribute('data-blog-post-id');
  if (!blogPostId) return;

  const title =
    article.querySelector('h1')?.textContent?.trim() ||
    document.title.replace(/^Papelê Educa\s*[-–|]\s*/i, '').trim() ||
    undefined;

  void trackBlogViewOnce(blogPostId, { title });
  initBlogReadTracking(blogPostId);
}

boot();
