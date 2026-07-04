import { supabase } from './supabase-client.js';
import { FREE_MATERIALS_BUCKET } from './config.js';

const form = document.getElementById('free-material-form');
const modal = document.getElementById('free-material-modal');
const statusEl = document.getElementById('free-form-status');
const listEl = document.getElementById('free-materials-list');
const newBtn = document.getElementById('free-new-btn');
const cancelBtn = document.getElementById('free-cancel-btn');
const closeBtn = document.getElementById('free-modal-close');
const formTitle = document.getElementById('free-form-title');
const coverPreviewEl = document.getElementById('free-cover-preview');
const fileInfoEl = document.getElementById('free-file-info');
const totalEl = document.getElementById('free-count-total');
const publishedEl = document.getElementById('free-count-published');
const draftEl = document.getElementById('free-count-draft');

const fields = {
  id: document.getElementById('free-material-id'),
  title: document.getElementById('free-title'),
  category: document.getElementById('free-category'),
  fileType: document.getElementById('free-file-type'),
  description: document.getElementById('free-description'),
  status: document.getElementById('free-status'),
  sortOrder: document.getElementById('free-sort-order'),
  file: document.getElementById('free-file'),
  cover: document.getElementById('free-cover'),
  existingFilePath: document.getElementById('free-existing-file-path'),
  existingFileUrl: document.getElementById('free-existing-file-url'),
  existingFileName: document.getElementById('free-existing-file-name'),
  existingCoverPath: document.getElementById('free-existing-cover-path'),
  existingCoverUrl: document.getElementById('free-existing-cover-url'),
};

const STATUS_LABELS = {
  published: 'Publicado',
  draft: 'Rascunho',
  archived: 'Arquivado',
};

let currentMaterials = [];
let pendingFile = null;
let pendingCover = null;
let coverPathToRemove = '';
let freeMaterialsBound = false;

const MAX_DOWNLOAD_FILE_BYTES = 50 * 1024 * 1024;
const MAX_COVER_BYTES = 10 * 1024 * 1024;

function formatFileSize(bytes) {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${Math.ceil(bytes / 1024)} KB`;
}

function mapSaveError(error, step = '') {
  const message = String(error?.message || error || 'Erro desconhecido ao salvar.');
  const status = error?.statusCode || error?.status;

  if (/failed to fetch|networkerror|network request failed/i.test(message)) {
    const prefix = step ? `${step}: ` : '';
    return `${prefix}Falha de conexão ao enviar dados. Verifique sua internet, teste em aba anônima (sem extensões) e confirme no Supabase se o bucket "free-materials" foi criado executando o arquivo supabase-free-materials.sql.`;
  }

  if (status === 403 || /row-level security|permission denied|42501/i.test(message)) {
    return `${step ? `${step}: ` : ''}Permissão negada. Confirme que seu usuário é admin e que as políticas de storage foram aplicadas (supabase-free-materials.sql).`;
  }

  if (/bucket not found|404/i.test(message)) {
    return 'Bucket "free-materials" não encontrado no Supabase. Execute supabase-free-materials.sql no SQL Editor.';
  }

  return step ? `${step}: ${message}` : message;
}

async function ensureAuthenticatedSession() {
  const { data: { session }, error } = await supabase.auth.getSession();
  if (error || !session) {
    throw new Error('Sessão expirada. Saia e entre no painel novamente.');
  }

  const expiresAtMs = (session.expires_at || 0) * 1000;
  if (expiresAtMs && expiresAtMs - Date.now() < 60_000) {
    const { data: refreshed, error: refreshError } = await supabase.auth.refreshSession();
    if (refreshError || !refreshed.session) {
      throw new Error('Não foi possível renovar a sessão. Entre no painel novamente.');
    }
    return refreshed.session;
  }

  return session;
}

function assertFileSize(file, maxBytes, label) {
  if (!file || file.size <= maxBytes) return;
  throw new Error(`${label} muito grande (${formatFileSize(file.size)}). Limite: ${formatFileSize(maxBytes)}.`);
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  })[char]);
}

function safeName(name) {
  return String(name || 'arquivo').replace(/[^a-zA-Z0-9._-]+/g, '_');
}

function detectFileType(fileName = '', fallback = 'PDF') {
  const extension = String(fileName).split('.').pop()?.toUpperCase();
  if (!extension || extension === fileName.toUpperCase()) return fallback;
  return extension;
}

function openFreeMaterialModal(material = null) {
  if (!modal) return;
  if (material) {
    editMaterial(material);
  } else {
    resetForm();
  }
  modal.showModal();
}

function closeFreeMaterialModal() {
  if (!modal) return;
  modal.close();
}

function resetForm() {
  if (!form) return;

  formTitle.textContent = 'Novo material gratuito';
  form.reset();
  fields.id.value = '';
  fields.existingFilePath.value = '';
  fields.existingFileUrl.value = '';
  fields.existingFileName.value = '';
  fields.existingCoverPath.value = '';
  fields.existingCoverUrl.value = '';
  fields.status.value = 'draft';
  fields.sortOrder.value = '0';
  fields.fileType.value = 'PDF';
  pendingFile = null;
  pendingCover = null;
  coverPathToRemove = '';
  statusEl.textContent = '';
  statusEl.className = 'form-status';
  renderFileInfo();
  renderCoverPreview();
}

function renderFileInfo() {
  if (!fileInfoEl) return;

  const name = pendingFile?.name || fields.existingFileName.value;
  const url = fields.existingFileUrl.value;

  if (!name) {
    fileInfoEl.innerHTML = '<p class="muted">Nenhum arquivo selecionado.</p>';
    return;
  }

  fileInfoEl.innerHTML = `
    <div class="file-info-card">
      <div>
        <strong>${escapeHtml(name)}</strong>
        <p class="muted">${pendingFile ? 'Novo arquivo pronto para envio' : 'Arquivo atual'}</p>
      </div>
      ${url && !pendingFile ? `<a class="btn-ghost btn-sm" href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">Abrir</a>` : ''}
    </div>
  `;
}

function renderCoverPreview() {
  if (!coverPreviewEl) return;

  coverPreviewEl.innerHTML = '';

  const coverUrl = pendingCover
    ? URL.createObjectURL(pendingCover)
    : fields.existingCoverUrl.value;

  if (!coverUrl) {
    coverPreviewEl.innerHTML = '<p class="muted">Capa opcional. Sem capa, o site usa o ícone padrão.</p>';
    return;
  }

  const thumb = document.createElement('div');
  thumb.className = 'thumb';
  thumb.innerHTML = `
    <img src="${escapeHtml(coverUrl)}" alt="Capa do material" />
    <button type="button" class="remove-image" aria-label="Remover capa">×</button>
  `;
  thumb.querySelector('.remove-image').addEventListener('click', () => {
    if (fields.existingCoverPath.value) {
      coverPathToRemove = fields.existingCoverPath.value;
    }
    pendingCover = null;
    fields.cover.value = '';
    fields.existingCoverPath.value = '';
    fields.existingCoverUrl.value = '';
    renderCoverPreview();
  });
  coverPreviewEl.appendChild(thumb);
}

function renderStatusChip(status) {
  const label = STATUS_LABELS[status] || status;
  return `<span class="chip chip-sm ${escapeHtml(status)}">${escapeHtml(label)}</span>`;
}

function renderFreeMaterialsTable(rows) {
  if (!rows.length) {
    return '<p class="metric-empty">Nenhum material gratuito cadastrado ainda.</p>';
  }

  return `
    <div class="corp-table-wrap">
      <table class="corp-table corp-table--catalog">
        <thead>
          <tr>
            <th scope="col" class="col-rank">Ordem</th>
            <th scope="col" class="col-product">Material</th>
            <th scope="col" class="col-type">Tipo</th>
            <th scope="col" class="col-status">Status</th>
            <th scope="col" class="col-file">Arquivo</th>
            <th scope="col" class="col-actions">Ações</th>
          </tr>
        </thead>
        <tbody>
          ${rows.map((material) => {
            const cover = material.cover_url || '../images/hero.png';
            return `
              <tr data-id="${escapeHtml(material.id)}">
                <td class="col-rank"><span class="rank-badge">${material.sort_order ?? 0}</span></td>
                <td class="col-product">
                  <div class="corp-product">
                    <img src="${escapeHtml(cover)}" alt="" loading="lazy" />
                    <div class="corp-product-copy">
                      <span class="corp-product-name" title="${escapeHtml(material.title)}">${escapeHtml(material.title)}</span>
                      <span class="corp-product-meta">${escapeHtml(material.category || 'Sem categoria')}</span>
                    </div>
                  </div>
                </td>
                <td class="col-type">${escapeHtml(material.file_type || '—')}</td>
                <td class="col-status">${renderStatusChip(material.status)}</td>
                <td class="col-file">
                  ${material.file_url
                    ? `<a class="table-link" href="${escapeHtml(material.file_url)}" target="_blank" rel="noopener noreferrer">Abrir</a>`
                    : '<span class="muted">—</span>'}
                </td>
                <td class="col-actions">
                  <div class="table-actions">
                    <button type="button" class="btn-ghost btn-sm" data-action="edit">Editar</button>
                    <button type="button" class="btn-ghost btn-sm btn-danger" data-action="delete">Excluir</button>
                  </div>
                </td>
              </tr>
            `;
          }).join('')}
        </tbody>
      </table>
    </div>
  `;
}

function bindTableActions() {
  if (!listEl) return;

  listEl.querySelectorAll('[data-action="edit"]').forEach((button) => {
    button.addEventListener('click', () => {
      const row = button.closest('tr');
      const id = row?.dataset.id;
      const material = currentMaterials.find((item) => item.id === id);
      if (material) openFreeMaterialModal(material);
    });
  });

  listEl.querySelectorAll('[data-action="delete"]').forEach((button) => {
    button.addEventListener('click', async () => {
      const row = button.closest('tr');
      const id = row?.dataset.id;
      const material = currentMaterials.find((item) => item.id === id);
      if (!material) return;
      if (!confirm(`Excluir "${material.title}"?`)) return;
      await deleteMaterial(material);
    });
  });
}

async function uploadAsset(file, folder, label) {
  assertFileSize(file, folder === 'covers' ? MAX_COVER_BYTES : MAX_DOWNLOAD_FILE_BYTES, label);

  await ensureAuthenticatedSession();

  const path = `${folder}/${crypto.randomUUID()}-${safeName(file.name)}`;
  const contentType = file.type || (folder === 'covers' ? 'image/jpeg' : 'application/octet-stream');
  const body = await file.arrayBuffer();

  const { error } = await supabase.storage
    .from(FREE_MATERIALS_BUCKET)
    .upload(path, body, {
      contentType,
      upsert: true,
      cacheControl: '3600',
    });

  if (error) {
    throw new Error(mapSaveError(error, label));
  }

  const { data } = supabase.storage.from(FREE_MATERIALS_BUCKET).getPublicUrl(path);
  return { path, url: data.publicUrl, name: file.name };
}

async function removeStoragePaths(paths) {
  const validPaths = paths.filter(Boolean);
  if (!validPaths.length) return;
  await supabase.storage.from(FREE_MATERIALS_BUCKET).remove(validPaths);
}

export async function loadFreeMaterials() {
  if (!listEl) return;

  const { data, error } = await supabase
    .from('free_materials')
    .select('*')
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: false });

  if (error) {
    listEl.innerHTML = `<p class="metric-empty">Erro ao carregar materiais: ${escapeHtml(error.message)}</p>`;
    return;
  }

  currentMaterials = data || [];
  if (totalEl) totalEl.textContent = currentMaterials.length;
  if (publishedEl) publishedEl.textContent = currentMaterials.filter((item) => item.status === 'published').length;
  if (draftEl) draftEl.textContent = currentMaterials.filter((item) => item.status === 'draft').length;

  listEl.innerHTML = renderFreeMaterialsTable(currentMaterials);
  bindTableActions();
}

function editMaterial(material) {
  formTitle.textContent = 'Editar material gratuito';
  fields.id.value = material.id;
  fields.title.value = material.title || '';
  fields.category.value = material.category || '';
  fields.fileType.value = material.file_type || 'PDF';
  fields.description.value = material.description || '';
  fields.status.value = material.status || 'draft';
  fields.sortOrder.value = material.sort_order ?? 0;
  fields.existingFilePath.value = material.file_path || '';
  fields.existingFileUrl.value = material.file_url || '';
  fields.existingFileName.value = material.file_name || '';
  fields.existingCoverPath.value = material.cover_path || '';
  fields.existingCoverUrl.value = material.cover_url || '';
  pendingFile = null;
  pendingCover = null;
  coverPathToRemove = '';
  fields.file.value = '';
  fields.cover.value = '';
  statusEl.textContent = '';
  statusEl.className = 'form-status';
  renderFileInfo();
  renderCoverPreview();
}

async function deleteMaterial(material) {
  await removeStoragePaths([material.file_path, material.cover_path]);

  const { error } = await supabase.from('free_materials').delete().eq('id', material.id);
  if (error) {
    alert(`Erro ao excluir: ${error.message}`);
    return;
  }

  await loadFreeMaterials();
  if (fields.id.value === material.id) {
    resetForm();
    closeFreeMaterialModal();
  }
}

function bindFreeMaterialsForm() {
  if (freeMaterialsBound || !form) return;
  freeMaterialsBound = true;

  newBtn?.addEventListener('click', () => openFreeMaterialModal());
  cancelBtn?.addEventListener('click', () => {
    resetForm();
    closeFreeMaterialModal();
  });
  closeBtn?.addEventListener('click', () => {
    resetForm();
    closeFreeMaterialModal();
  });

  modal?.addEventListener('cancel', (event) => {
    event.preventDefault();
    resetForm();
    closeFreeMaterialModal();
  });

  modal?.addEventListener('click', (event) => {
    if (event.target === modal) {
      resetForm();
      closeFreeMaterialModal();
    }
  });

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    statusEl.textContent = 'Salvando...';
    statusEl.className = 'form-status';

    try {
      await ensureAuthenticatedSession();

      const title = fields.title.value.trim();
      if (!title) throw new Error('Informe o título do material.');

      const id = fields.id.value || null;
      let filePath = fields.existingFilePath.value;
      let fileUrl = fields.existingFileUrl.value;
      let fileName = fields.existingFileName.value;
      let coverPath = fields.existingCoverPath.value;
      let coverUrl = fields.existingCoverUrl.value;
      const pathsToRemove = [];

      if (pendingFile) {
        statusEl.textContent = 'Enviando arquivo para download...';
        const uploaded = await uploadAsset(pendingFile, 'files', 'Arquivo para download');
        if (filePath) pathsToRemove.push(filePath);
        filePath = uploaded.path;
        fileUrl = uploaded.url;
        fileName = uploaded.name;
        fields.fileType.value = detectFileType(uploaded.name, fields.fileType.value || 'PDF');
      }

      if (!filePath || !fileUrl) {
        throw new Error('Envie o arquivo para download.');
      }

      if (pendingCover) {
        statusEl.textContent = 'Enviando capa...';
        const uploadedCover = await uploadAsset(pendingCover, 'covers', 'Capa');
        if (coverPath) pathsToRemove.push(coverPath);
        coverPath = uploadedCover.path;
        coverUrl = uploadedCover.url;
      } else if (coverPathToRemove) {
        pathsToRemove.push(coverPathToRemove);
        coverPath = '';
        coverUrl = '';
      }

      statusEl.textContent = 'Salvando registro...';

      const payload = {
        title,
        description: fields.description.value.trim(),
        category: fields.category.value.trim(),
        file_type: fields.fileType.value.trim() || detectFileType(fileName),
        file_path: filePath,
        file_url: fileUrl,
        file_name: fileName,
        cover_path: coverPath,
        cover_url: coverUrl,
        status: fields.status.value,
        sort_order: Number(fields.sortOrder.value || 0),
        updated_at: new Date().toISOString(),
      };

      let error = null;
      if (id) {
        ({ error } = await supabase.from('free_materials').update(payload).eq('id', id));
      } else {
        ({ error } = await supabase.from('free_materials').insert(payload));
      }

      if (error) throw new Error(mapSaveError(error, 'Registro'));

      await removeStoragePaths(pathsToRemove);

      statusEl.textContent = 'Material gratuito salvo com sucesso.';
      resetForm();
      closeFreeMaterialModal();
      await loadFreeMaterials();
    } catch (error) {
      statusEl.textContent = mapSaveError(error);
      statusEl.classList.add('error');
    }
  });

  fields.file?.addEventListener('change', () => {
    pendingFile = fields.file.files?.[0] || null;
    if (pendingFile) {
      fields.fileType.value = detectFileType(pendingFile.name, fields.fileType.value || 'PDF');
    }
    renderFileInfo();
  });

  fields.cover?.addEventListener('change', () => {
    pendingCover = fields.cover.files?.[0] || null;
    coverPathToRemove = '';
    renderCoverPreview();
  });
}

export async function initFreeMaterials() {
  if (!form || !listEl) return;
  bindFreeMaterialsForm();
  await loadFreeMaterials();
}
