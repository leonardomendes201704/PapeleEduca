import { SUPABASE_URL, SUPABASE_ANON_KEY } from './public-config.js';

const VISITOR_KEY = 'pe_visitor_id';
const SESSION_KEY = 'pe_session_id';
const VIEW_PREFIX = 'pe_viewed_';
const CAMPAIGN_KEYS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content'];

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

function getRequestPayload(productId, eventType, metadata = {}) {
  return {
    product_id: productId,
    event_type: eventType,
    visitor_id: getVisitorId(),
    session_id: getSessionId(),
    source: metadata.source || 'site',
    pathname: metadata.pathname || window.location.pathname,
    referrer: metadata.referrer || document.referrer || null,
    metadata: {
      ...getCampaignParams(),
      viewport: {
        width: window.innerWidth,
        height: window.innerHeight,
      },
      language: navigator.language || null,
      ...metadata,
    },
  };
}

async function sendEvent(payload) {
  const body = JSON.stringify([payload]);
  const url = `${SUPABASE_URL}/rest/v1/product_events`;
  const headers = {
    apikey: SUPABASE_ANON_KEY,
    Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
    'Content-Type': 'application/json',
    Prefer: 'return=minimal',
  };

  const response = await fetch(url, {
    method: 'POST',
    headers,
    body,
    keepalive: true,
  });

  if (!response.ok) {
    throw new Error(`Falha ao registrar evento (${response.status})`);
  }
}

export function trackProductEvent(productId, eventType, metadata = {}) {
  if (!productId || !eventType) return Promise.resolve(false);
  const payload = getRequestPayload(productId, eventType, metadata);
  return sendEvent(payload).then(() => true).catch(() => false);
}

export function trackProductViewOnce(productId, metadata = {}) {
  if (!productId) return Promise.resolve(false);
  const storageKey = `${VIEW_PREFIX}${productId}`;
  if (safeStorage(sessionStorage, storageKey)) {
    return Promise.resolve(false);
  }

  safeStorage(sessionStorage, storageKey, '1');
  return trackProductEvent(productId, 'view', metadata);
}

export function bindProductCardTracking(container, source = 'site') {
  if (!container || container.dataset.metricsBound === '1') return;
  container.dataset.metricsBound = '1';

  container.addEventListener('click', (event) => {
    const target = event.target instanceof Element ? event.target.closest('a.product') : null;
    if (!target) return;

    const productId = target.dataset.productId;
    if (!productId) return;

    void trackProductEvent(productId, 'open', {
      source,
      card_source: source,
      pathname: window.location.pathname,
    });
  });
}

export function trackProductBuyClick(productId, metadata = {}) {
  return trackProductEvent(productId, 'buy_click', metadata);
}

const FREE_VIEW_PREFIX = 'pe_free_viewed_';

function getFreeMaterialRequestPayload(freeMaterialId, eventType, metadata = {}) {
  return {
    free_material_id: freeMaterialId,
    event_type: eventType,
    visitor_id: getVisitorId(),
    session_id: getSessionId(),
    source: metadata.source || 'site',
    pathname: metadata.pathname || window.location.pathname,
    referrer: metadata.referrer || document.referrer || null,
    metadata: {
      ...getCampaignParams(),
      viewport: {
        width: window.innerWidth,
        height: window.innerHeight,
      },
      language: navigator.language || null,
      ...metadata,
    },
  };
}

async function sendFreeMaterialEvent(payload) {
  const body = JSON.stringify([payload]);
  const url = `${SUPABASE_URL}/rest/v1/free_material_events`;
  const headers = {
    apikey: SUPABASE_ANON_KEY,
    Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
    'Content-Type': 'application/json',
    Prefer: 'return=minimal',
  };

  const response = await fetch(url, {
    method: 'POST',
    headers,
    body,
    keepalive: true,
  });

  if (!response.ok) {
    throw new Error(`Falha ao registrar evento (${response.status})`);
  }
}

export function trackFreeMaterialEvent(freeMaterialId, eventType, metadata = {}) {
  if (!freeMaterialId || !eventType) return Promise.resolve(false);
  const payload = getFreeMaterialRequestPayload(freeMaterialId, eventType, metadata);
  return sendFreeMaterialEvent(payload).then(() => true).catch(() => false);
}

export function trackFreeMaterialViewOnce(freeMaterialId, metadata = {}) {
  if (!freeMaterialId) return Promise.resolve(false);
  const storageKey = `${FREE_VIEW_PREFIX}${freeMaterialId}`;
  if (safeStorage(sessionStorage, storageKey)) {
    return Promise.resolve(false);
  }

  safeStorage(sessionStorage, storageKey, '1');
  return trackFreeMaterialEvent(freeMaterialId, 'view', metadata);
}

export function trackFreeMaterialDownload(freeMaterialId, metadata = {}) {
  return trackFreeMaterialEvent(freeMaterialId, 'download', metadata);
}

export function bindFreeMaterialTracking(container, source = 'home') {
  if (!container || container.dataset.freeMetricsBound === '1') return;
  container.dataset.freeMetricsBound = '1';

  container.querySelectorAll('[data-free-material-id]').forEach((card) => {
    const materialId = card.dataset.freeMaterialId;
    if (!materialId) return;
    void trackFreeMaterialViewOnce(materialId, {
      source,
      pathname: window.location.pathname,
    });
  });

  container.addEventListener('click', (event) => {
    const target = event.target instanceof Element
      ? event.target.closest('[data-free-download-id]')
      : null;
    if (!target) return;

    const materialId = target.dataset.freeDownloadId;
    if (!materialId) return;

    void trackFreeMaterialDownload(materialId, {
      source,
      pathname: window.location.pathname,
      file_name: target.dataset.fileName || null,
    });
  });
}
