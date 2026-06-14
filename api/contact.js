const nodemailer = require('nodemailer');

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function sendJson(res, statusCode, payload) {
  res.status(statusCode).setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(payload));
}

function parseBody(body) {
  if (!body) {
    return {};
  }

  if (typeof body === 'string') {
    try {
      return JSON.parse(body);
    } catch {
      return {};
    }
  }

  return body;
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return sendJson(res, 405, { error: 'Method not allowed.' });
  }

  const { name = '', email = '', message = '', company = '' } = parseBody(req.body);

  if (company) {
    return sendJson(res, 200, { ok: true });
  }

  const cleanName = String(name).trim();
  const cleanEmail = String(email).trim();
  const cleanMessage = String(message).trim();

  if (!cleanName || !cleanEmail || !cleanMessage) {
    return sendJson(res, 400, { error: 'Preencha nome, e-mail e mensagem.' });
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
    return sendJson(res, 400, { error: 'Informe um e-mail valido.' });
  }

  const smtpHost = process.env.SMTP_HOST;
  const smtpPort = Number(process.env.SMTP_PORT || 465);
  const smtpUser = process.env.SMTP_USER;
  const smtpPass = process.env.SMTP_PASS;
  const contactTo = process.env.CONTACT_TO || smtpUser;

  if (!smtpHost || !smtpPort || !smtpUser || !smtpPass || !contactTo) {
    return sendJson(res, 500, {
      error: 'Configure SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS e CONTACT_TO no ambiente.',
    });
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

  const subject = `Novo contato do site - ${cleanName}`;
  const html = `
    <div style="font-family: Arial, sans-serif; color: #263238; line-height: 1.5">
      <h2 style="margin: 0 0 16px">Novo contato pelo site</h2>
      <p><strong>Nome:</strong> ${escapeHtml(cleanName)}</p>
      <p><strong>E-mail:</strong> ${escapeHtml(cleanEmail)}</p>
      <p><strong>Mensagem:</strong></p>
      <div style="white-space: pre-wrap; background: #f8f4ec; border: 1px solid #e4dccf; border-radius: 12px; padding: 16px">
        ${escapeHtml(cleanMessage)}
      </div>
    </div>
  `;

  await transporter.sendMail({
    from: `"Papele Educa" <${smtpUser}>`,
    to: contactTo,
    replyTo: cleanEmail,
    subject,
    html,
    text: `Nome: ${cleanName}\nE-mail: ${cleanEmail}\n\nMensagem:\n${cleanMessage}`,
  });

  return sendJson(res, 200, { ok: true });
};
