const nodemailer = require('nodemailer');

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

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function parseRecipients(raw) {
  return String(raw || '')
    .split(/[,;\n]+/)
    .map((item) => item.trim())
    .filter(Boolean)
    .filter((email, index, list) => list.indexOf(email) === index);
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function normalizeTime(value) {
  const match = String(value || '08:00').trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return '08:00';
  const hour = Math.min(23, Math.max(0, Number(match[1])));
  const minute = Math.min(59, Math.max(0, Number(match[2])));
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

function getBrazilDateParts(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(date);

  const map = Object.fromEntries(parts.filter((p) => p.type !== 'literal').map((p) => [p.type, p.value]));
  const hour = map.hour === '24' ? '00' : map.hour;
  return {
    dateKey: `${map.year}-${map.month}-${map.day}`,
    time: `${hour}:${map.minute}`,
    year: Number(map.year),
    month: Number(map.month),
    day: Number(map.day),
    hour: Number(hour),
    minute: Number(map.minute),
  };
}

function brazilDayBounds(dateKey) {
  // Midnight BRT as ISO with offset -03:00 (no DST in Brazil since 2019)
  const from = new Date(`${dateKey}T00:00:00-03:00`);
  const to = new Date(from.getTime() + 24 * 60 * 60 * 1000);
  return { from, to };
}

function previousBrazilDateKey(date = new Date()) {
  const shifted = new Date(date.getTime() - 24 * 60 * 60 * 1000);
  return getBrazilDateParts(shifted).dateKey;
}

function formatDatePt(date) {
  return new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

function formatDateOnlyPt(dateKey) {
  const [y, m, d] = dateKey.split('-');
  return `${d}/${m}/${y}`;
}

function formatNumber(value) {
  return new Intl.NumberFormat('pt-BR').format(Number(value || 0));
}

function formatPercent(num, den) {
  const n = Number(num || 0);
  const d = Number(den || 0);
  if (!d) return '0%';
  return `${Math.round((n / d) * 1000) / 10}%`.replace('.', ',');
}

function documentCode(dateKey) {
  return `PE-MX-${dateKey.replace(/-/g, '')}`;
}

function tableRows(headers, rows, emptyLabel) {
  if (!rows.length) {
    return `
      <tr>
        <td colspan="${headers.length}" style="padding:14px 12px;color:#6c7a86;font-style:italic;border:1px solid #cfc7b8;">
          ${escapeHtml(emptyLabel)}
        </td>
      </tr>
    `;
  }

  return rows
    .map(
      (cells, index) => `
      <tr style="background:${index % 2 === 0 ? '#ffffff' : '#faf8f3'};">
        ${cells
          .map(
            (cell, cellIndex) => `
          <td style="padding:10px 12px;border:1px solid #cfc7b8;font-size:13px;color:#263238;${
            cellIndex === 0 ? 'text-align:left;' : 'text-align:right;font-variant-numeric:tabular-nums;'
          }">
            ${cell}
          </td>`,
          )
          .join('')}
      </tr>`,
    )
    .join('');
}

function buildReportHtml({ snapshot, periodDateKey, generatedAt, force }) {
  const products = snapshot.products || {};
  const free = snapshot.free_materials || {};
  const blog = snapshot.blog || {};
  const lifetime = snapshot.lifetime || {};
  const topProducts = Array.isArray(snapshot.top_products) ? snapshot.top_products : [];
  const topFree = Array.isArray(snapshot.top_free_materials) ? snapshot.top_free_materials : [];
  const topBlog = Array.isArray(snapshot.top_blog_posts) ? snapshot.top_blog_posts : [];

  const conversion = formatPercent(products.buy_clicks, products.views);
  const readRate = formatPercent(blog.read_completes, blog.post_views);
  const code = documentCode(periodDateKey);
  const periodLabel = formatDateOnlyPt(periodDateKey);

  const productRows = topProducts.map((item, index) => [
    `<strong style="color:#40505c;">${index + 1}.</strong> ${escapeHtml(item.title || 'Produto')}<br><span style="color:#6c7a86;font-size:11px;">${escapeHtml(item.category || 'Sem categoria')}</span>`,
    formatNumber(item.views),
    formatNumber(item.opens),
    `<strong>${formatNumber(item.buy_clicks)}</strong>`,
  ]);

  const freeRows = topFree.map((item, index) => [
    `<strong style="color:#40505c;">${index + 1}.</strong> ${escapeHtml(item.title || 'Material')}<br><span style="color:#6c7a86;font-size:11px;">${escapeHtml(item.category || 'Sem categoria')}</span>`,
    formatNumber(item.views),
    `<strong>${formatNumber(item.downloads)}</strong>`,
  ]);

  const blogRows = topBlog.map((item, index) => [
    `<strong style="color:#40505c;">${index + 1}.</strong> ${escapeHtml(item.title || 'Post')}<br><span style="color:#6c7a86;font-size:11px;">${escapeHtml(item.category || 'Sem categoria')}</span>`,
    formatNumber(item.views),
    formatNumber(item.read_completes),
    formatPercent(item.read_completes, item.views),
  ]);

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Extrato de Métricas — Papelê Educa</title>
</head>
<body style="margin:0;padding:0;background:#e8e2d6;font-family:Georgia,'Times New Roman',serif;color:#263238;">
  <div style="max-width:720px;margin:0 auto;padding:24px 12px;">
    <div style="background:#fffdf8;border:1px solid #b7ad9a;box-shadow:0 8px 24px rgba(38,50,56,0.08);">
      <!-- Timbre -->
      <div style="border-bottom:3px double #2fb7b0;padding:22px 28px 18px;background:linear-gradient(180deg,#f8f4ec 0%,#fffdf8 100%);">
        <table width="100%" cellpadding="0" cellspacing="0" role="presentation">
          <tr>
            <td style="vertical-align:top;">
              <div style="font-size:11px;letter-spacing:0.18em;text-transform:uppercase;color:#2fb7b0;font-family:Arial,sans-serif;font-weight:700;">
                Papelê Educa
              </div>
              <div style="font-size:22px;margin-top:6px;color:#1f2a30;letter-spacing:0.02em;">
                Extrato de Métricas
              </div>
              <div style="font-size:13px;color:#6c7a86;margin-top:4px;font-family:Arial,sans-serif;">
                Relatório operacional diário — uso interno
              </div>
            </td>
            <td style="vertical-align:top;text-align:right;font-family:Arial,sans-serif;">
              <div style="display:inline-block;border:1px solid #cfc7b8;padding:10px 12px;background:#fff;">
                <div style="font-size:10px;letter-spacing:0.12em;text-transform:uppercase;color:#6c7a86;">Documento</div>
                <div style="font-size:14px;font-weight:700;color:#263238;margin-top:2px;">${escapeHtml(code)}</div>
                <div style="font-size:11px;color:#6c7a86;margin-top:6px;">Competência</div>
                <div style="font-size:13px;font-weight:700;">${escapeHtml(periodLabel)}</div>
              </div>
            </td>
          </tr>
        </table>
      </div>

      <!-- Cabeçalho formulário -->
      <div style="padding:16px 28px;border-bottom:1px solid #d8d2c6;font-family:Arial,sans-serif;font-size:12px;background:#fcfaf6;">
        <table width="100%" cellpadding="0" cellspacing="0" role="presentation">
          <tr>
            <td style="padding:4px 0;width:50%;"><strong>Emitido em:</strong> ${escapeHtml(formatDatePt(generatedAt))} (BRT)</td>
            <td style="padding:4px 0;width:50%;"><strong>Período apurado:</strong> ${escapeHtml(periodLabel)} (00:00–23:59 BRT)</td>
          </tr>
          <tr>
            <td style="padding:4px 0;"><strong>Origem:</strong> ${force ? 'Envio manual (admin)' : 'Agendamento automático'}</td>
            <td style="padding:4px 0;"><strong>Fuso:</strong> America/Sao_Paulo</td>
          </tr>
        </table>
      </div>

      <!-- Resumo do dia -->
      <div style="padding:22px 28px 8px;font-family:Arial,sans-serif;">
        <div style="font-size:12px;letter-spacing:0.14em;text-transform:uppercase;color:#6c7a86;font-weight:700;margin-bottom:12px;">
          1. Resumo do movimento do dia
        </div>
        <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="border-collapse:collapse;">
          <tr>
            <td style="width:25%;padding:8px;border:1px solid #cfc7b8;background:#f3fbfa;vertical-align:top;">
              <div style="font-size:10px;letter-spacing:0.08em;text-transform:uppercase;color:#1f9f9b;">Produtos · views</div>
              <div style="font-size:22px;font-weight:700;margin-top:4px;">${formatNumber(products.views)}</div>
              <div style="font-size:11px;color:#6c7a86;margin-top:4px;">${formatNumber(products.unique_visitors)} visitantes únicos</div>
            </td>
            <td style="width:25%;padding:8px;border:1px solid #cfc7b8;background:#fff8ef;vertical-align:top;">
              <div style="font-size:10px;letter-spacing:0.08em;text-transform:uppercase;color:#c9841f;">Cliques compra</div>
              <div style="font-size:22px;font-weight:700;margin-top:4px;">${formatNumber(products.buy_clicks)}</div>
              <div style="font-size:11px;color:#6c7a86;margin-top:4px;">Conv. ${conversion}</div>
            </td>
            <td style="width:25%;padding:8px;border:1px solid #cfc7b8;background:#f7f5ff;vertical-align:top;">
              <div style="font-size:10px;letter-spacing:0.08em;text-transform:uppercase;color:#6b5cc7;">Downloads</div>
              <div style="font-size:22px;font-weight:700;margin-top:4px;">${formatNumber(free.downloads)}</div>
              <div style="font-size:11px;color:#6c7a86;margin-top:4px;">${formatNumber(free.views)} views materiais</div>
            </td>
            <td style="width:25%;padding:8px;border:1px solid #cfc7b8;background:#f8f4ec;vertical-align:top;">
              <div style="font-size:10px;letter-spacing:0.08em;text-transform:uppercase;color:#40505c;">Blog · leituras</div>
              <div style="font-size:22px;font-weight:700;margin-top:4px;">${formatNumber(blog.read_completes)}</div>
              <div style="font-size:11px;color:#6c7a86;margin-top:4px;">Taxa ${readRate} · ${formatNumber(blog.post_views)} views</div>
            </td>
          </tr>
        </table>
      </div>

      <!-- Campos estilo formulário -->
      <div style="padding:16px 28px 8px;font-family:Arial,sans-serif;">
        <div style="font-size:12px;letter-spacing:0.14em;text-transform:uppercase;color:#6c7a86;font-weight:700;margin-bottom:10px;">
          2. Detalhamento por área
        </div>
        <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="border-collapse:collapse;font-size:13px;">
          <tr>
            <td style="padding:10px 12px;border:1px solid #cfc7b8;width:40%;background:#faf8f3;"><strong>Produtos — aberturas de página</strong></td>
            <td style="padding:10px 12px;border:1px solid #cfc7b8;text-align:right;">${formatNumber(products.opens)}</td>
          </tr>
          <tr>
            <td style="padding:10px 12px;border:1px solid #cfc7b8;background:#faf8f3;"><strong>Materiais — visitantes únicos</strong></td>
            <td style="padding:10px 12px;border:1px solid #cfc7b8;text-align:right;">${formatNumber(free.unique_visitors)}</td>
          </tr>
          <tr>
            <td style="padding:10px 12px;border:1px solid #cfc7b8;background:#faf8f3;"><strong>Blog — views da listagem</strong></td>
            <td style="padding:10px 12px;border:1px solid #cfc7b8;text-align:right;">${formatNumber(blog.listing_views)}</td>
          </tr>
          <tr>
            <td style="padding:10px 12px;border:1px solid #cfc7b8;background:#faf8f3;"><strong>Blog — leitores únicos (posts)</strong></td>
            <td style="padding:10px 12px;border:1px solid #cfc7b8;text-align:right;">${formatNumber(blog.unique_readers)}</td>
          </tr>
        </table>
      </div>

      <!-- Rankings -->
      <div style="padding:18px 28px 8px;font-family:Arial,sans-serif;">
        <div style="font-size:12px;letter-spacing:0.14em;text-transform:uppercase;color:#6c7a86;font-weight:700;margin-bottom:10px;">
          3. Ranking do período — Produtos
        </div>
        <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="border-collapse:collapse;">
          <thead>
            <tr style="background:#2fb7b0;color:#fff;">
              <th style="padding:10px 12px;text-align:left;font-size:11px;letter-spacing:0.06em;text-transform:uppercase;border:1px solid #249a94;">Item</th>
              <th style="padding:10px 12px;text-align:right;font-size:11px;letter-spacing:0.06em;text-transform:uppercase;border:1px solid #249a94;">Views</th>
              <th style="padding:10px 12px;text-align:right;font-size:11px;letter-spacing:0.06em;text-transform:uppercase;border:1px solid #249a94;">Abert.</th>
              <th style="padding:10px 12px;text-align:right;font-size:11px;letter-spacing:0.06em;text-transform:uppercase;border:1px solid #249a94;">Compras</th>
            </tr>
          </thead>
          <tbody>
            ${tableRows(['Item', 'Views', 'Abert.', 'Compras'], productRows, 'Sem movimento de produtos no período.')}
          </tbody>
        </table>
      </div>

      <div style="padding:18px 28px 8px;font-family:Arial,sans-serif;">
        <div style="font-size:12px;letter-spacing:0.14em;text-transform:uppercase;color:#6c7a86;font-weight:700;margin-bottom:10px;">
          4. Ranking do período — Materiais gratuitos
        </div>
        <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="border-collapse:collapse;">
          <thead>
            <tr style="background:#f4a53b;color:#fff;">
              <th style="padding:10px 12px;text-align:left;font-size:11px;letter-spacing:0.06em;text-transform:uppercase;border:1px solid #d48c28;">Item</th>
              <th style="padding:10px 12px;text-align:right;font-size:11px;letter-spacing:0.06em;text-transform:uppercase;border:1px solid #d48c28;">Views</th>
              <th style="padding:10px 12px;text-align:right;font-size:11px;letter-spacing:0.06em;text-transform:uppercase;border:1px solid #d48c28;">Downloads</th>
            </tr>
          </thead>
          <tbody>
            ${tableRows(['Item', 'Views', 'Downloads'], freeRows, 'Sem downloads no período.')}
          </tbody>
        </table>
      </div>

      <div style="padding:18px 28px 8px;font-family:Arial,sans-serif;">
        <div style="font-size:12px;letter-spacing:0.14em;text-transform:uppercase;color:#6c7a86;font-weight:700;margin-bottom:10px;">
          5. Ranking do período — Blog
        </div>
        <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="border-collapse:collapse;">
          <thead>
            <tr style="background:#7c6ae6;color:#fff;">
              <th style="padding:10px 12px;text-align:left;font-size:11px;letter-spacing:0.06em;text-transform:uppercase;border:1px solid #6858c9;">Item</th>
              <th style="padding:10px 12px;text-align:right;font-size:11px;letter-spacing:0.06em;text-transform:uppercase;border:1px solid #6858c9;">Views</th>
              <th style="padding:10px 12px;text-align:right;font-size:11px;letter-spacing:0.06em;text-transform:uppercase;border:1px solid #6858c9;">Leituras</th>
              <th style="padding:10px 12px;text-align:right;font-size:11px;letter-spacing:0.06em;text-transform:uppercase;border:1px solid #6858c9;">Taxa</th>
            </tr>
          </thead>
          <tbody>
            ${tableRows(['Item', 'Views', 'Leituras', 'Taxa'], blogRows, 'Sem visualizações de posts no período.')}
          </tbody>
        </table>
      </div>

      <!-- Acumulado -->
      <div style="padding:18px 28px 24px;font-family:Arial,sans-serif;">
        <div style="font-size:12px;letter-spacing:0.14em;text-transform:uppercase;color:#6c7a86;font-weight:700;margin-bottom:10px;">
          6. Saldo acumulado (desde o início)
        </div>
        <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="border-collapse:collapse;font-size:13px;border:2px solid #263238;">
          <tr style="background:#263238;color:#fff;">
            <th style="padding:10px 12px;text-align:left;">Conta</th>
            <th style="padding:10px 12px;text-align:right;">Saldo</th>
          </tr>
          <tr>
            <td style="padding:10px 12px;border-top:1px solid #cfc7b8;">Produtos — visualizações</td>
            <td style="padding:10px 12px;border-top:1px solid #cfc7b8;text-align:right;font-weight:700;">${formatNumber(lifetime.products?.views)}</td>
          </tr>
          <tr style="background:#faf8f3;">
            <td style="padding:10px 12px;border-top:1px solid #cfc7b8;">Produtos — cliques de compra</td>
            <td style="padding:10px 12px;border-top:1px solid #cfc7b8;text-align:right;font-weight:700;">${formatNumber(lifetime.products?.buy_clicks)}</td>
          </tr>
          <tr>
            <td style="padding:10px 12px;border-top:1px solid #cfc7b8;">Materiais — downloads</td>
            <td style="padding:10px 12px;border-top:1px solid #cfc7b8;text-align:right;font-weight:700;">${formatNumber(lifetime.free_materials?.downloads)}</td>
          </tr>
          <tr style="background:#faf8f3;">
            <td style="padding:10px 12px;border-top:1px solid #cfc7b8;">Blog — views de posts</td>
            <td style="padding:10px 12px;border-top:1px solid #cfc7b8;text-align:right;font-weight:700;">${formatNumber(lifetime.blog?.post_views)}</td>
          </tr>
          <tr>
            <td style="padding:10px 12px;border-top:1px solid #cfc7b8;">Blog — leituras completas</td>
            <td style="padding:10px 12px;border-top:1px solid #cfc7b8;text-align:right;font-weight:700;">${formatNumber(lifetime.blog?.read_completes)}</td>
          </tr>
          <tr style="background:#faf8f3;">
            <td style="padding:10px 12px;border-top:1px solid #cfc7b8;">Blog — views da listagem</td>
            <td style="padding:10px 12px;border-top:1px solid #cfc7b8;text-align:right;font-weight:700;">${formatNumber(lifetime.blog?.listing_views)}</td>
          </tr>
        </table>
      </div>

      <div style="padding:14px 28px 22px;border-top:3px double #b7ad9a;font-family:Arial,sans-serif;font-size:11px;color:#6c7a86;line-height:1.5;background:#fcfaf6;">
        Documento gerado automaticamente pelo sistema Papelê Educa. Os totais do dia consideram eventos registrados entre 00:00 e 23:59 no horário de Brasília.
        Rankings exibem até 8 itens com maior movimento no período. Este extrato não substitui análises detalhadas do painel administrativo.
      </div>
    </div>
  </div>
</body>
</html>`;
}

function buildReportText({ snapshot, periodDateKey, generatedAt }) {
  const products = snapshot.products || {};
  const free = snapshot.free_materials || {};
  const blog = snapshot.blog || {};
  return [
    'EXTRATO DE MÉTRICAS — PAPELÊ EDUCA',
    `Documento: ${documentCode(periodDateKey)}`,
    `Competência: ${formatDateOnlyPt(periodDateKey)}`,
    `Emitido em: ${formatDatePt(generatedAt)} (BRT)`,
    '',
    'RESUMO DO DIA',
    `- Produtos views: ${products.views || 0}`,
    `- Cliques compra: ${products.buy_clicks || 0}`,
    `- Downloads: ${free.downloads || 0}`,
    `- Blog leituras: ${blog.read_completes || 0}`,
    `- Blog views posts: ${blog.post_views || 0}`,
    '',
    'Acesse o painel admin para o detalhamento completo.',
  ].join('\n');
}

async function supabaseRequest(path, { method = 'GET', body, prefer, userToken } = {}) {
  const base = cleanSecret(process.env.SUPABASE_URL).replace(/\/$/, '');
  const serviceKey = cleanSecret(process.env.SUPABASE_SERVICE_ROLE_KEY);
  const anonKey = cleanSecret(process.env.SUPABASE_ANON_KEY);
  const key = userToken ? anonKey || serviceKey : serviceKey;

  if (!base || !key) {
    const err = new Error('Configure SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY (e SUPABASE_ANON_KEY para envio manual).');
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
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
  }

  if (!response.ok) {
    const message = data?.message || data?.error_description || data?.error || text || response.statusText;
    const err = new Error(message);
    err.statusCode = response.status;
    throw err;
  }

  return data;
}

async function supabaseRpc(fnName, args) {
  return supabaseRequest(`rpc/${fnName}`, {
    method: 'POST',
    body: args,
  });
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
  const profiles = await supabaseRequest(`profiles?id=eq.${encodeURIComponent(user.id)}&select=role`);
  const role = Array.isArray(profiles) ? profiles[0]?.role : profiles?.role;
  if (role !== 'admin') {
    const err = new Error('Apenas administradores podem disparar o relatório manualmente.');
    err.statusCode = 403;
    throw err;
  }
  return user;
}

function extractBearer(req) {
  const header = req.headers.authorization || req.headers.Authorization || '';
  const match = String(header).match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : '';
}

function isCronAuthorized(req) {
  const cronSecret = cleanSecret(process.env.CRON_SECRET);
  if (!cronSecret) return false;
  const bearer = extractBearer(req);
  if (bearer && bearer === cronSecret) return true;
  const headerSecret = cleanSecret(req.headers['x-cron-secret'] || '');
  return headerSecret === cronSecret;
}

function timeToMinutes(value) {
  const normalized = normalizeTime(value);
  const [h, m] = normalized.split(':').map(Number);
  return h * 60 + m;
}

async function loadSettings() {
  const rows = await supabaseRequest(
    'site_settings?id=eq.1&select=metrics_email_enabled,metrics_email_recipients,metrics_email_time,metrics_email_last_sent_at,metrics_email_last_error',
  );
  return Array.isArray(rows) ? rows[0] || null : rows;
}

async function updateSettings(patch) {
  await supabaseRequest('site_settings?id=eq.1', {
    method: 'PATCH',
    body: patch,
    prefer: 'return=minimal',
  });
}

async function sendReportEmail({ to, subject, html, text }) {
  const smtpHost = process.env.SMTP_HOST;
  const smtpPort = Number(process.env.SMTP_PORT || 465);
  const smtpUser = process.env.SMTP_USER;
  const smtpPass = process.env.SMTP_PASS;

  if (!smtpHost || !smtpUser || !smtpPass) {
    const err = new Error('Configure SMTP_HOST, SMTP_PORT, SMTP_USER e SMTP_PASS no ambiente.');
    err.statusCode = 500;
    throw err;
  }

  const transporter = nodemailer.createTransport({
    host: smtpHost,
    port: smtpPort,
    secure: smtpPort === 465,
    auth: {
      user: smtpUser,
      pass: smtpPass,
    },
  });

  await transporter.sendMail({
    from: `"Papelê Educa Relatórios" <${smtpUser}>`,
    to: to.join(', '),
    subject,
    html,
    text,
  });
}

module.exports = async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST');
    return sendJson(res, 405, { error: 'Method not allowed.' });
  }

  const body = parseBody(req.body);
  const force =
    String(req.query?.force || body.force || '').toLowerCase() === '1' ||
    String(req.query?.force || body.force || '').toLowerCase() === 'true';

  try {
    let authMode = null;

    if (isCronAuthorized(req)) {
      authMode = 'cron';
    } else if (force) {
      const token = extractBearer(req);
      if (!token) {
        return sendJson(res, 401, { error: 'Informe o Bearer token do admin ou o CRON_SECRET.' });
      }
      await assertAdminFromToken(token);
      authMode = 'admin';
    } else {
      return sendJson(res, 401, {
        error: 'Não autorizado. Use CRON_SECRET (cron) ou force=1 com sessão de admin.',
      });
    }

    const settings = await loadSettings();
    if (!settings) {
      return sendJson(res, 500, { error: 'site_settings não encontrado. Execute o schema do Supabase.' });
    }

    const recipients = parseRecipients(settings.metrics_email_recipients);
    const invalid = recipients.filter((email) => !isValidEmail(email));
    if (invalid.length) {
      return sendJson(res, 400, { error: `Destinatários inválidos: ${invalid.join(', ')}` });
    }
    if (!recipients.length) {
      return sendJson(res, 400, { error: 'Cadastre ao menos um destinatário em Configurações.' });
    }

    const now = new Date();
    const brNow = getBrazilDateParts(now);
    const configuredTime = normalizeTime(settings.metrics_email_time);
    const configuredMinutes = timeToMinutes(configuredTime);

    // Só bloqueia o cron se já houve envio HOJE no horário agendado ou depois.
    // Assim o "Enviar agora" (teste antes das 18:00) não cancela o automático.
    let alreadySentForSchedule = false;
    if (settings.metrics_email_last_sent_at) {
      const lastSentBRT = getBrazilDateParts(new Date(settings.metrics_email_last_sent_at));
      alreadySentForSchedule =
        lastSentBRT.dateKey === brNow.dateKey &&
        timeToMinutes(lastSentBRT.time) >= configuredMinutes;
    }

    if (!force) {
      if (!settings.metrics_email_enabled) {
        return sendJson(res, 200, { ok: true, skipped: true, reason: 'disabled' });
      }
      if (alreadySentForSchedule) {
        return sendJson(res, 200, { ok: true, skipped: true, reason: 'already_sent_today' });
      }
      if (timeToMinutes(brNow.time) < configuredMinutes) {
        return sendJson(res, 200, {
          ok: true,
          skipped: true,
          reason: 'before_scheduled_time',
          scheduled: configuredTime,
          now: brNow.time,
        });
      }
    }

    const periodDateKey = previousBrazilDateKey(now);
    const bounds = brazilDayBounds(periodDateKey);
    const snapshot = await supabaseRpc('get_metrics_email_snapshot', {
      p_from: bounds.from.toISOString(),
      p_to: bounds.to.toISOString(),
    });

    if (!snapshot || typeof snapshot !== 'object') {
      throw new Error('Falha ao montar snapshot de métricas.');
    }

    const html = buildReportHtml({
      snapshot,
      periodDateKey,
      generatedAt: now,
      force: Boolean(force),
    });
    const text = buildReportText({ snapshot, periodDateKey, generatedAt: now });
    const subject = `Extrato de métricas ${formatDateOnlyPt(periodDateKey)} — Papelê Educa`;

    await sendReportEmail({ to: recipients, subject, html, text });

    await updateSettings({
      metrics_email_last_sent_at: now.toISOString(),
      metrics_email_last_error: '',
      updated_at: now.toISOString(),
    });

    return sendJson(res, 200, {
      ok: true,
      sent: true,
      authMode,
      recipients,
      period: periodDateKey,
      document: documentCode(periodDateKey),
    });
  } catch (error) {
    try {
      await updateSettings({
        metrics_email_last_error: String(error.message || error).slice(0, 500),
        updated_at: new Date().toISOString(),
      });
    } catch {
      // ignore secondary failure
    }

    return sendJson(res, error.statusCode || 500, {
      error: error.message || 'Falha ao enviar relatório de métricas.',
    });
  }
};
