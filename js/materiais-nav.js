import { supabase } from './supabase-client.js';
import {
  APOSTILAS_LABEL,
  MATERIALS_TREE,
  buildFilterUrl,
} from './materiais-taxonomy.js';

const CLOSE_DELAY_MS = 220;

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  })[char]);
}

function resolveBasePath() {
  const path = window.location.pathname.replace(/\\/g, '/').toLowerCase();
  if (path.includes('/blog/') || path.includes('/api/blog/') || path.startsWith('/api/')) {
    return '/atividades.html';
  }
  return './atividades.html';
}

function isMateriaisActive() {
  const path = window.location.pathname.replace(/\\/g, '/').toLowerCase();
  return path.endsWith('/atividades.html') || path.endsWith('/atividades');
}

function isFinePointerHover() {
  return window.matchMedia('(hover: hover) and (pointer: fine)').matches;
}

function countLabel(count) {
  const n = Number.isFinite(count) ? count : 0;
  return `(${n})`;
}

function buildMenuHtml(basePath, counts) {
  const items = MATERIALS_TREE.map((node) => {
    const parentHref = escapeHtml(buildFilterUrl({ basePath, category: node.name }));
    const parentCount = counts.byCategory[node.name] || 0;

    if (!node.children.length) {
      return `
        <li>
          <a href="${parentHref}">
            <span class="menu-item-label">${escapeHtml(node.name)}</span>
            <span class="menu-item-count">${countLabel(parentCount)}</span>
          </a>
        </li>
      `;
    }

    const children = node.children.map((child) => {
      const href = escapeHtml(buildFilterUrl({
        basePath,
        category: node.name,
        subcategory: child,
      }));
      const key = `${node.name}::${child}`;
      const childCount = counts.byPair[key] || 0;
      return `
        <li>
          <a href="${href}">
            <span class="menu-item-label">${escapeHtml(child)}</span>
            <span class="menu-item-count">${countLabel(childCount)}</span>
          </a>
        </li>
      `;
    }).join('');

    return `
      <li class="has-children">
        <a class="menu-parent" href="${parentHref}">
          <span class="menu-item-label">${escapeHtml(node.name)}</span>
          <span class="menu-item-count">${countLabel(parentCount)}</span>
        </a>
        <ul class="submenu">${children}</ul>
      </li>
    `;
  }).join('');

  const allHref = escapeHtml(buildFilterUrl({ basePath }));

  return `
    <div class="nav-materiais-panel">
      <span class="menu-label">${escapeHtml(APOSTILAS_LABEL)}</span>
      <ul class="nav-materiais-list" role="none">
        ${items}
        <li>
          <a class="menu-all" href="${allHref}">
            <span class="menu-item-label">Ver todos os materiais</span>
            <span class="menu-item-count">${countLabel(counts.total)}</span>
          </a>
        </li>
      </ul>
    </div>
  `;
}

function closeMenu(root) {
  root.classList.remove('is-open');
  const toggle = root.querySelector('.nav-materiais-toggle');
  if (toggle) toggle.setAttribute('aria-expanded', 'false');
}

function openMenu(root) {
  if (root._closeTimer) {
    clearTimeout(root._closeTimer);
    root._closeTimer = null;
  }
  root.classList.add('is-open');
  const toggle = root.querySelector('.nav-materiais-toggle');
  if (toggle) toggle.setAttribute('aria-expanded', 'true');
}

function scheduleClose(root) {
  if (root._closeTimer) clearTimeout(root._closeTimer);
  root._closeTimer = setTimeout(() => {
    root._closeTimer = null;
    closeMenu(root);
  }, CLOSE_DELAY_MS);
}

async function loadCategoryCounts() {
  const empty = { byCategory: {}, byPair: {}, total: 0 };
  try {
    const { data, error } = await supabase
      .from('products')
      .select('category,subcategory')
      .eq('status', 'published');

    if (error || !Array.isArray(data)) return empty;

    const byCategory = {};
    const byPair = {};
    let total = 0;

    data.forEach((row) => {
      const category = String(row.category || '').trim();
      const subcategory = String(row.subcategory || '').trim();
      if (!category) return;
      total += 1;
      byCategory[category] = (byCategory[category] || 0) + 1;
      if (subcategory) {
        const key = `${category}::${subcategory}`;
        byPair[key] = (byPair[key] || 0) + 1;
      }
    });

    return { byCategory, byPair, total };
  } catch {
    return empty;
  }
}

function enhancePlaceholder(placeholder, counts) {
  const basePath = resolveBasePath();
  const active = isMateriaisActive() || placeholder.classList.contains('active');
  const label = placeholder.textContent.trim() || 'Materiais';

  const root = document.createElement('div');
  root.className = `nav-item--materiais${active ? ' is-active' : ''}`;
  root.dataset.materiaisNav = 'ready';
  root._closeTimer = null;

  root.innerHTML = `
    <button
      type="button"
      class="nav-materiais-toggle"
      aria-expanded="false"
      aria-haspopup="true"
      aria-controls="materiais-menu"
    >
      <span>${escapeHtml(label === 'Atividades' || label === 'Categorias' ? 'Materiais' : label)}</span>
      <span class="nav-materiais-caret" aria-hidden="true"></span>
    </button>
    <div class="nav-materiais-menu" id="materiais-menu" role="menu">
      ${buildMenuHtml(basePath, counts)}
    </div>
  `;

  placeholder.replaceWith(root);

  const toggle = root.querySelector('.nav-materiais-toggle');
  toggle.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    if (root.classList.contains('is-open')) closeMenu(root);
    else openMenu(root);
  });

  root.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      closeMenu(root);
      toggle.focus();
    }
  });

  root.addEventListener('mouseenter', () => {
    if (isFinePointerHover()) openMenu(root);
  });
  root.addEventListener('mouseleave', () => {
    if (isFinePointerHover()) scheduleClose(root);
  });

  return root;
}

function bindOutsideClose() {
  document.addEventListener('click', (event) => {
    document.querySelectorAll('.nav-item--materiais.is-open').forEach((root) => {
      if (!root.contains(event.target)) closeMenu(root);
    });
  });
}

async function init() {
  const placeholders = document.querySelectorAll('[data-materiais-nav]');
  if (!placeholders.length) return;

  const counts = await loadCategoryCounts();
  placeholders.forEach((el) => enhancePlaceholder(el, counts));
  bindOutsideClose();
}

void init();
