import { supabase } from './supabase-client.js';
import { safeText } from './product-card.js';

const grid = document.getElementById('free-materials-grid');
const noteEl = document.getElementById('free-materials-note');

const ICON_COLORS = ['teal', 'orange', 'purple'];

const DOWNLOAD_ICON = `
  <span class="btn-icon right" aria-hidden="true">
    <svg viewBox="0 0 24 24" focusable="false" aria-hidden="true">
      <path d="M12 3a1 1 0 0 1 1 1v9.59l2.3-2.3a1 1 0 1 1 1.4 1.42l-4 4a1 1 0 0 1-1.4 0l-4-4a1 1 0 1 1 1.4-1.42L11 13.59V4a1 1 0 0 1 1-1Zm-7 14a1 1 0 0 1 1 1v1h12v-1a1 1 0 1 1 2 0v2a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-2a1 1 0 0 1 1-1Z"/>
    </svg>
  </span>
`;

const FILE_ICON = `
  <svg viewBox="0 0 24 24" focusable="false">
    <path d="M14 2H7a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8Zm0 2.5L17.5 8H14ZM8 12h8v2H8Zm0 4h8v2H8Zm0-8h4v2H8Z"/>
  </svg>
`;

function renderMedia(material, index) {
  if (material.cover_url) {
    return `
      <div class="free-card-cover">
        <img src="${safeText(material.cover_url)}" alt="${safeText(material.title)}" loading="lazy" />
      </div>
    `;
  }

  const color = ICON_COLORS[index % ICON_COLORS.length];
  return `
    <div class="free-card-icon ${color}" aria-hidden="true">
      ${FILE_ICON}
    </div>
  `;
}

function renderMeta(material) {
  const tags = [material.file_type, material.category].filter(Boolean);
  if (!tags.length) return '';

  return `
    <div class="free-card-meta">
      ${tags.map((tag) => `<span>${safeText(tag)}</span>`).join('')}
    </div>
  `;
}

function renderCard(material, index) {
  const fileUrl = material.file_url || '#';
  const fileName = material.file_name || 'material';

  return `
    <article class="free-card">
      <span class="free-card-badge">Grátis</span>
      ${renderMedia(material, index)}
      ${renderMeta(material)}
      <h3>${safeText(material.title)}</h3>
      <p>${safeText(material.description || 'Material gratuito para download.')}</p>
      <a
        class="btn"
        href="${safeText(fileUrl)}"
        download="${safeText(fileName)}"
        target="_blank"
        rel="noopener noreferrer"
      >
        <span class="btn-label">Baixar grátis</span>
        ${DOWNLOAD_ICON}
      </a>
    </article>
  `;
}

async function loadFreeMaterials() {
  if (!grid) return;

  const { data, error } = await supabase
    .from('free_materials')
    .select('id,title,description,category,file_type,file_url,file_name,cover_url,sort_order')
    .eq('status', 'published')
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: false });

  if (error) {
    grid.innerHTML = `
      <article class="free-card free-card--message">
        <h3>Não foi possível carregar os materiais</h3>
        <p>${safeText(error.message)}</p>
      </article>
    `;
    if (noteEl) noteEl.hidden = true;
    return;
  }

  if (!data?.length) {
    grid.innerHTML = `
      <article class="free-card free-card--message">
        <h3>Em breve novos materiais gratuitos</h3>
        <p>Estamos preparando recursos para você baixar e usar em casa ou na escola.</p>
      </article>
    `;
    if (noteEl) {
      noteEl.innerHTML = 'Prefere falar com a gente? <a href="#contato">Envie uma mensagem</a>.';
    }
    return;
  }

  grid.innerHTML = data.map((material, index) => renderCard(material, index)).join('');

  if (noteEl) {
    noteEl.hidden = false;
    noteEl.innerHTML = 'Os arquivos abrem em uma nova aba para download imediato. Dúvidas? <a href="#contato">Fale com a gente</a>.';
  }
}

loadFreeMaterials();
