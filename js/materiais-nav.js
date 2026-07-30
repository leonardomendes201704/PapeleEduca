import {
  APOSTILAS_LABEL,
  MATERIALS_TREE,
  buildFilterUrl,
} from './materiais-taxonomy.js';

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
  // Prefer absolute path so SSR blog routes and nested paths resolve correctly
  if (path.includes('/blog/') || path.includes('/api/blog/') || path.startsWith('/api/')) {
    return '/atividades.html';
  }
  return './atividades.html';
}

function isMateriaisActive() {
  const path = window.location.pathname.replace(/\\/g, '/').toLowerCase();
  return path.endsWith('/atividades.html') || path.endsWith('/atividades');
}

function buildMenuHtml(basePath) {
  const items = MATERIALS_TREE.map((node) => {
    const parentHref = escapeHtml(buildFilterUrl({ basePath, category: node.name }));
    if (!node.children.length) {
      return `
        <li>
          <a href="${parentHref}">${escapeHtml(node.name)}</a>
        </li>
      `;
    }

    const children = node.children.map((child) => {
      const href = escapeHtml(buildFilterUrl({
        basePath,
        category: node.name,
        subcategory: child,
      }));
      return `<li><a href="${href}">${escapeHtml(child)}</a></li>`;
    }).join('');

    return `
      <li class="has-children">
        <a class="menu-parent" href="${parentHref}">${escapeHtml(node.name)}</a>
        <ul class="submenu">${children}</ul>
      </li>
    `;
  }).join('');

  const allHref = escapeHtml(buildFilterUrl({ basePath }));

  return `
    <span class="menu-label">${escapeHtml(APOSTILAS_LABEL)}</span>
    <ul class="nav-materiais-list" role="none">
      ${items}
      <li>
        <a class="menu-all" href="${allHref}">Ver todos os materiais</a>
      </li>
    </ul>
  `;
}

function closeMenu(root) {
  root.classList.remove('is-open');
  const toggle = root.querySelector('.nav-materiais-toggle');
  if (toggle) toggle.setAttribute('aria-expanded', 'false');
}

function openMenu(root) {
  root.classList.add('is-open');
  const toggle = root.querySelector('.nav-materiais-toggle');
  if (toggle) toggle.setAttribute('aria-expanded', 'true');
}

function enhancePlaceholder(placeholder) {
  const basePath = resolveBasePath();
  const active = isMateriaisActive() || placeholder.classList.contains('active');
  const label = placeholder.textContent.trim() || 'Materiais';

  const root = document.createElement('div');
  root.className = `nav-item--materiais${active ? ' is-active' : ''}`;
  root.dataset.materiaisNav = 'ready';

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
      ${buildMenuHtml(basePath)}
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

  // Desktop: open on hover
  root.addEventListener('mouseenter', () => {
    if (window.matchMedia('(hover: hover) and (pointer: fine)').matches) {
      openMenu(root);
    }
  });
  root.addEventListener('mouseleave', () => {
    if (window.matchMedia('(hover: hover) and (pointer: fine)').matches) {
      closeMenu(root);
    }
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

function init() {
  const placeholders = document.querySelectorAll('[data-materiais-nav]');
  if (!placeholders.length) return;

  placeholders.forEach((el) => enhancePlaceholder(el));
  bindOutsideClose();
}

init();
