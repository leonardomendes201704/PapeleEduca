import { supabase } from './supabase-client.js';

const ASSET_VERSION = 'blog-menu-1';

function loadModule(path) {
  return import(`${path}?v=${ASSET_VERSION}`);
}

const ROUTES = {
  overview: {
    hash: '#/overview',
    title: 'Visão geral',
    breadcrumb: 'Painel / Visão geral',
  },
  produtos: {
    hash: '#/produtos',
    title: 'Produtos pagos',
    breadcrumb: 'Painel / Produtos',
  },
  gratuitos: {
    hash: '#/gratuitos',
    title: 'Materiais gratuitos',
    breadcrumb: 'Painel / Materiais gratuitos',
  },
  metricas: {
    hash: '#/metricas',
    title: 'Desempenho do site',
    breadcrumb: 'Métricas / Visão geral',
  },
  blog: {
    hash: '#/blog',
    title: 'Blog',
    breadcrumb: 'Painel / Blog',
  },
  configuracoes: {
    hash: '#/configuracoes',
    title: 'Configurações',
    breadcrumb: 'Painel / Configurações',
  },
};

const DEFAULT_ROUTE = 'overview';
const initialized = new Set();

function parseRoute() {
  const hash = window.location.hash || `#/${DEFAULT_ROUTE}`;
  const match = hash.match(/^#\/(\w+)/);
  const key = match?.[1];
  return ROUTES[key] ? key : DEFAULT_ROUTE;
}

function setActiveView(routeKey) {
  document.querySelectorAll('.admin-view').forEach((view) => {
    view.classList.toggle('is-active', view.dataset.view === routeKey);
  });

  document.querySelectorAll('.sidebar-link').forEach((link) => {
    link.classList.toggle('is-active', link.dataset.route === routeKey);
  });

  const route = ROUTES[routeKey];
  const breadcrumbEl = document.getElementById('page-breadcrumb');
  const titleEl = document.getElementById('page-title');
  if (breadcrumbEl) breadcrumbEl.textContent = route.breadcrumb;
  if (titleEl) titleEl.textContent = route.title;

  document.title = `${route.title} — Papelê Educa Admin`;
}

function closeSidebar() {
  document.querySelector('.admin-sidebar')?.classList.remove('is-open');
  document.querySelector('.admin-sidebar-backdrop')?.classList.remove('is-visible');
}

async function initView(routeKey) {
  switch (routeKey) {
    case 'overview':
      await loadModule('./overview-admin.js').then((m) => m.initOverview());
      break;
    case 'produtos':
      if (initialized.has(routeKey)) {
        await loadModule('./dashboard.js').then((m) => m.loadProducts());
        return;
      }
      initialized.add(routeKey);
      await loadModule('./dashboard.js').then((m) => m.initProducts());
      break;
    case 'gratuitos':
      if (initialized.has(routeKey)) {
        await loadModule('./free-materials-admin.js').then((m) => m.loadFreeMaterials());
        return;
      }
      initialized.add(routeKey);
      await loadModule('./free-materials-admin.js').then((m) => m.initFreeMaterials());
      break;
    case 'metricas':
      await loadModule('./metrics-admin.js').then((m) => m.initMetrics());
      break;
    case 'blog':
      if (initialized.has(routeKey)) return;
      initialized.add(routeKey);
      await loadModule('./blog-admin.js').then((m) => m.initBlogSettings());
      break;
    case 'configuracoes':
      if (initialized.has(routeKey)) return;
      initialized.add(routeKey);
      await loadModule('./dashboard.js').then((m) => m.initSettings());
      break;
    default:
      break;
  }
}

async function navigate(routeKey, { replace = false } = {}) {
  const target = ROUTES[routeKey] ? routeKey : DEFAULT_ROUTE;
  const hash = ROUTES[target].hash;

  if (window.location.hash !== hash) {
    if (replace) {
      history.replaceState(null, '', hash);
    } else {
      window.location.hash = hash;
    }
  }

  setActiveView(target);
  await initView(target);
  closeSidebar();
}

async function requireAdmin() {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) {
    window.location.href = '/admin/';
    return null;
  }
  return session;
}

async function ensureAdminRole() {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return false;

  const { data, error } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .maybeSingle();

  if (error || !data || data.role !== 'admin') {
    await supabase.auth.signOut();
    window.location.href = '/admin/';
    return false;
  }

  return true;
}

function bindShellEvents() {
  document.querySelectorAll('.sidebar-link').forEach((link) => {
    link.addEventListener('click', (event) => {
      event.preventDefault();
      const route = link.dataset.route;
      if (route) void navigate(route);
    });
  });

  document.querySelectorAll('[data-nav]').forEach((link) => {
    link.addEventListener('click', (event) => {
      event.preventDefault();
      const route = link.dataset.nav;
      if (route) void navigate(route);
    });
  });

  document.getElementById('logout-btn')?.addEventListener('click', async () => {
    await supabase.auth.signOut();
    window.location.href = '/admin/';
  });

  document.getElementById('sidebar-toggle')?.addEventListener('click', () => {
    document.querySelector('.admin-sidebar')?.classList.add('is-open');
    document.querySelector('.admin-sidebar-backdrop')?.classList.add('is-visible');
  });

  document.querySelector('.admin-sidebar-backdrop')?.addEventListener('click', closeSidebar);

  window.addEventListener('hashchange', () => {
    void navigate(parseRoute(), { replace: true });
  });
}

async function boot() {
  const session = await requireAdmin();
  if (!session) return;

  const isAdmin = await ensureAdminRole();
  if (!isAdmin) return;

  bindShellEvents();

  if (!window.location.hash) {
    history.replaceState(null, '', ROUTES[DEFAULT_ROUTE].hash);
  }

  await navigate(parseRoute(), { replace: true });
}

boot();
