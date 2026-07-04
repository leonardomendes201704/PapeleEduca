import { supabase } from './supabase-client.js';
import { FREE_MATERIALS_BUCKET } from './config.js';

const form = document.getElementById('free-material-form');
const statusEl = document.getElementById('free-form-status');
const listEl = document.getElementById('free-materials-list');
const clearBtn = document.getElementById('free-clear-btn');
const formTitle = document.getElementById('free-form-title');
const coverPreviewEl = document.getElementById('free-cover-preview');
const fileInfoEl = document.getElementById('free-file-info');
const totalEl = document.getElementById('free-count-total');
const publishedEl = document.getElementById('free-count-published');
const draftEl = document.getElementById('free-count-draft');
const freeMetricViewsEl = document.getElementById('free-metric-views');
const freeMetricUniqueViewsEl = document.getElementById('free-metric-unique-views');
const freeMetricDownloadsEl = document.getElementById('free-metric-downloads');
const freeMetricConversionEl = document.getElementById('free-metric-conversion');
const freeMetricsListEl = document.getElementById('free-metrics-list');

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

let currentMaterials = [];
let pendingFile = null;
let pendingCover = null;
let coverPathToRemove = '';

function safeName(name) {
  return String(name || 'arquivo').replace(/[^a-zA-Z0-9._-]+/g, '_');
}

function detectFileType(fileName = '', fallback = 'PDF') {
  const extension = String(fileName).split('.').pop()?.toUpperCase();
  if (!extension || extension === fileName.toUpperCase()) return fallback;
  return extension;
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
        <strong>${name}</strong>
        <p class="muted">${pendingFile ? 'Novo arquivo pronto para envio' : 'Arquivo atual'}</p>
      </div>
      ${url && !pendingFile ? `<a class="btn-ghost" href="${url}" target="_blank" rel="noopener noreferrer">Abrir</a>` : ''}
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
    <img src="${coverUrl}" alt="Capa do material" />
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

async function uploadAsset(file, folder) {
  const path = `${folder}/${crypto.randomUUID()}-${safeName(file.name)}`;
  const { error } = await supabase.storage
    .from(FREE_MATERIALS_BUCKET)
    .upload(path, file, { contentType: file.type || undefined, upsert: false });

  if (error) throw error;

  const { data } = supabase.storage.from(FREE_MATERIALS_BUCKET).getPublicUrl(path);
  return { path, url: data.publicUrl, name: file.name };
}

async function removeStoragePaths(paths) {
  const validPaths = paths.filter(Boolean);
  if (!validPaths.length) return;
  await supabase.storage.from(FREE_MATERIALS_BUCKET).remove(validPaths);
}

function formatPercent(value) {
  return `${Math.round(value * 100)}%`;
}

async function loadFreeMaterialMetrics() {
  if (!freeMetricsListEl) return;

  const { data, error } = await supabase
    .from('free_material_metrics_report')
    .select('id,title,category,file_type,status,views,unique_views,downloads,last_event_at')
    .order('downloads', { ascending: false })
    .order('views', { ascending: false });

  if (error) {
    freeMetricsListEl.innerHTML = `<p class="metric-empty">Erro ao carregar métricas: ${error.message}</p>`;
    return;
  }

  const rows = (data || []).filter((item) => Number(item.views || 0) > 0 || Number(item.downloads || 0) > 0);
  const totals = rows.reduce((acc, item) => {
    acc.views += Number(item.views || 0);
    acc.uniqueViews += Number(item.unique_views || 0);
    acc.downloads += Number(item.downloads || 0);
    return acc;
  }, { views: 0, uniqueViews: 0, downloads: 0 });

  if (freeMetricViewsEl) freeMetricViewsEl.textContent = totals.views;
  if (freeMetricUniqueViewsEl) freeMetricUniqueViewsEl.textContent = totals.uniqueViews;
  if (freeMetricDownloadsEl) freeMetricDownloadsEl.textContent = totals.downloads;
  if (freeMetricConversionEl) {
    const rate = totals.views > 0 ? totals.downloads / totals.views : 0;
    freeMetricConversionEl.textContent = formatPercent(rate);
  }

  if (!rows.length) {
    freeMetricsListEl.innerHTML = '<p class="metric-empty">Ainda não há visualizações ou downloads registrados.</p>';
    return;
  }

  freeMetricsListEl.innerHTML = `
    <div class="metric-row head free-metric-row">
      <div>Material</div>
      <div class="metric-value">Vis.</div>
      <div class="metric-value">Únicas</div>
      <div class="metric-value">Downloads</div>
      <div class="metric-value">Taxa</div>
      <div>Último evento</div>
    </div>
    ${rows.map((item) => {
      const rate = item.views > 0 ? Number(item.downloads || 0) / Number(item.views || 1) : 0;
      const lastEvent = item.last_event_at
        ? new Date(item.last_event_at).toLocaleString('pt-BR')
        : 'Sem dados';
      return `
        <div class="metric-row free-metric-row">
          <div>
            <div class="metric-product">${item.title}</div>
            <div class="muted">${item.category || 'Sem categoria'} • ${item.file_type || 'Arquivo'}</div>
          </div>
          <div class="metric-value">${item.views || 0}</div>
          <div class="metric-value">${item.unique_views || 0}</div>
          <div class="metric-value">${item.downloads || 0}</div>
          <div class="metric-value metric-rate">${formatPercent(rate)}</div>
          <div class="muted">${lastEvent}</div>
        </div>
      `;
    }).join('')}
  `;
}

async function loadFreeMaterials() {
  if (!listEl) return;

  const { data, error } = await supabase
    .from('free_materials')
    .select('*')
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: false });

  if (error) {
    listEl.innerHTML = `<p class="muted">Erro ao carregar materiais: ${error.message}</p>`;
    return;
  }

  currentMaterials = data || [];
  if (totalEl) totalEl.textContent = currentMaterials.length;
  if (publishedEl) publishedEl.textContent = currentMaterials.filter((item) => item.status === 'published').length;
  if (draftEl) draftEl.textContent = currentMaterials.filter((item) => item.status === 'draft').length;

  if (!currentMaterials.length) {
    listEl.innerHTML = '<p class="muted">Nenhum material gratuito cadastrado ainda.</p>';
    return;
  }

  listEl.innerHTML = '';
  currentMaterials.forEach((material) => {
    const wrapper = document.createElement('div');
    wrapper.className = 'product-row free-material-row';

    const cover = material.cover_url || '../images/hero.png';

    wrapper.innerHTML = `
      <img src="${cover}" alt="${material.title}" />
      <div class="product-meta">
        <h3>${material.title}</h3>
        <p>${material.category || 'Sem categoria'} • ${material.file_type || 'Arquivo'}</p>
        <div class="product-actions-row">
          <span class="chip ${material.status}">${material.status}</span>
          <span class="chip">Ordem ${material.sort_order ?? 0}</span>
          ${material.file_name ? `<span class="chip">${material.file_name}</span>` : ''}
        </div>
      </div>
      <div class="product-actions-row">
        ${material.file_url ? `<a class="btn-ghost" href="${material.file_url}" target="_blank" rel="noopener noreferrer">Arquivo</a>` : ''}
        <button type="button" class="btn-ghost" data-action="edit">Editar</button>
        <button type="button" class="btn-ghost" data-action="delete">Excluir</button>
      </div>
    `;

    wrapper.querySelector('[data-action="edit"]').addEventListener('click', () => {
      editMaterial(material);
      document.getElementById('admin-free-materials')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });

    wrapper.querySelector('[data-action="delete"]').addEventListener('click', async () => {
      if (!confirm(`Excluir "${material.title}"?`)) return;
      await deleteMaterial(material);
    });

    listEl.appendChild(wrapper);
  });
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
  if (fields.id.value === material.id) resetForm();
  await loadFreeMaterialMetrics();
}

form?.addEventListener('submit', async (event) => {
  event.preventDefault();
  statusEl.textContent = 'Salvando...';
  statusEl.className = 'form-status';

  try {
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
      const uploaded = await uploadAsset(pendingFile, 'files');
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
      const uploadedCover = await uploadAsset(pendingCover, 'covers');
      if (coverPath) pathsToRemove.push(coverPath);
      coverPath = uploadedCover.path;
      coverUrl = uploadedCover.url;
    } else if (coverPathToRemove) {
      pathsToRemove.push(coverPathToRemove);
      coverPath = '';
      coverUrl = '';
    }

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

    if (error) throw error;

    await removeStoragePaths(pathsToRemove);

    statusEl.textContent = 'Material gratuito salvo com sucesso.';
    resetForm();
    await Promise.all([loadFreeMaterials(), loadFreeMaterialMetrics()]);
  } catch (error) {
    statusEl.textContent = error.message;
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

clearBtn?.addEventListener('click', resetForm);

export async function initFreeMaterialsAdmin() {
  if (!form || !listEl) return;
  resetForm();
  await Promise.all([loadFreeMaterials(), loadFreeMaterialMetrics()]);
}
