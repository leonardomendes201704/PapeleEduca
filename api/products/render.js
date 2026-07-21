/**
 * Server-rendered product page for Open Graph / social previews.
 * /produto/:id → rewrite → /api/products/render?id=:id
 *
 * Facebook's crawler does not run JS, so OG tags must be in the initial HTML.
 * Real browsers are redirected via JS to /product.html?id=... (same UX as before).
 */

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function sendHtml(res, statusCode, html) {
  res.status(statusCode).setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=300');
  res.end(html);
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

function firstImageUrl(images, siteOrigin) {
  const fallback = `${siteOrigin}/images/hero.png`;
  if (!Array.isArray(images) || !images.length) return fallback;
  const first = images[0];
  const raw = typeof first === 'string' ? first : first?.url;
  if (!raw) return fallback;
  if (/^https?:\/\//i.test(raw)) return raw;
  if (raw.startsWith('/')) return `${siteOrigin}${raw}`;
  return `${siteOrigin}/${String(raw).replace(/^\.\//, '')}`;
}

function excerpt(text, max = 200) {
  const clean = String(text || '').replace(/\s+/g, ' ').trim();
  if (!clean) return 'Material pedagógico da Papelê Educa.';
  if (clean.length <= max) return clean;
  return `${clean.slice(0, max - 1).trim()}…`;
}

async function fetchPublishedProduct(id) {
  const base = cleanSecret(process.env.SUPABASE_URL).replace(/\/$/, '');
  const key =
    cleanSecret(process.env.SUPABASE_ANON_KEY) ||
    cleanSecret(process.env.SUPABASE_SERVICE_ROLE_KEY);
  if (!base || !key) return null;

  const url = `${base}/rest/v1/products?id=eq.${encodeURIComponent(id)}&select=id,title,slug,description,category,images,status&limit=1`;
  const response = await fetch(url, {
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
    },
  });
  if (!response.ok) return null;
  const rows = await response.json();
  const product = Array.isArray(rows) ? rows[0] : null;
  if (!product || product.status !== 'published') return null;
  return product;
}

function renderPage(product, siteOrigin) {
  const title = product.title || 'Produto';
  const description = excerpt(product.description);
  const image = firstImageUrl(product.images, siteOrigin);
  const canonical = `${siteOrigin}/produto/${encodeURIComponent(product.id)}`;
  const productPage = `${siteOrigin}/product.html?id=${encodeURIComponent(product.id)}`;
  const category = product.category || 'Material pedagógico';

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escapeHtml(title)} | Papelê Educa</title>
  <meta name="description" content="${escapeHtml(description)}" />
  <link rel="canonical" href="${escapeHtml(canonical)}" />
  <meta property="og:type" content="product" />
  <meta property="og:site_name" content="Papelê Educa" />
  <meta property="og:locale" content="pt_BR" />
  <meta property="og:url" content="${escapeHtml(canonical)}" />
  <meta property="og:title" content="${escapeHtml(title)}" />
  <meta property="og:description" content="${escapeHtml(description)}" />
  <meta property="og:image" content="${escapeHtml(image)}" />
  <meta property="og:image:secure_url" content="${escapeHtml(image)}" />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="${escapeHtml(title)}" />
  <meta name="twitter:description" content="${escapeHtml(description)}" />
  <meta name="twitter:image" content="${escapeHtml(image)}" />
  <script>
    (function () {
      var id = ${JSON.stringify(String(product.id))};
      var params = new URLSearchParams(window.location.search || '');
      params.set('id', id);
      window.location.replace('/product.html?' + params.toString());
    })();
  </script>
</head>
<body>
  <main style="font-family: system-ui, sans-serif; max-width: 720px; margin: 40px auto; padding: 0 16px;">
    <p style="color:#6c7a86;">${escapeHtml(category)}</p>
    <h1>${escapeHtml(title)}</h1>
    <p>${escapeHtml(description)}</p>
    <p><img src="${escapeHtml(image)}" alt="${escapeHtml(title)}" style="max-width:100%;border-radius:12px;" /></p>
    <p><a href="${escapeHtml(productPage)}">Abrir página do produto</a></p>
  </main>
</body>
</html>`;
}

module.exports = async function handler(req, res) {
  const id = String(req.query?.id || '').trim();
  if (!id) {
    return sendHtml(res, 400, '<!DOCTYPE html><html><body><h1>Informe o id do produto</h1></body></html>');
  }

  try {
    const product = await fetchPublishedProduct(id);
    if (!product) {
      return sendHtml(
        res,
        404,
        '<!DOCTYPE html><html lang="pt-BR"><body><h1>Produto não encontrado</h1><p><a href="/index.html">Voltar ao início</a></p></body></html>'
      );
    }
    const proto = req.headers['x-forwarded-proto'] || 'https';
    const host = req.headers['x-forwarded-host'] || req.headers.host || 'papele-educa.vercel.app';
    const origin = `${proto}://${host}`;
    return sendHtml(res, 200, renderPage(product, origin));
  } catch (error) {
    return sendHtml(
      res,
      500,
      `<!DOCTYPE html><html><body><h1>Erro</h1><p>${escapeHtml(error.message)}</p></body></html>`
    );
  }
};
