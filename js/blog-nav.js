import { supabase } from './supabase-client.js';

const DEFAULT_ENABLED = true;

function setBlogNavVisible(enabled) {
  document.querySelectorAll('[data-nav-item="blog"]').forEach((el) => {
    el.hidden = !enabled;
    el.style.display = enabled ? '' : 'none';
    if (!enabled) {
      el.setAttribute('aria-hidden', 'true');
    } else {
      el.removeAttribute('aria-hidden');
    }
  });
}

function shouldGateBlogPage() {
  const path = window.location.pathname.replace(/\\/g, '/').toLowerCase();
  return (
    path.endsWith('/blog.html')
    || path.endsWith('/blog')
    || path.includes('/blog/')
    || path.includes('/api/blog/render')
  );
}

function redirectHome() {
  const depth = window.location.pathname.replace(/\\/g, '/').includes('/blog/') ? '../' : './';
  window.location.replace(`${depth}index.html`);
}

async function applyBlogMenuSetting() {
  const hasNav = document.querySelector('[data-nav-item="blog"]');
  const gatePage = shouldGateBlogPage();
  if (!hasNav && !gatePage) return;

  let enabled = DEFAULT_ENABLED;

  try {
    const { data, error } = await supabase
      .from('site_settings')
      .select('blog_menu_enabled')
      .eq('id', 1)
      .maybeSingle();

    if (!error && data && typeof data.blog_menu_enabled === 'boolean') {
      enabled = data.blog_menu_enabled;
    }
  } catch {
    enabled = DEFAULT_ENABLED;
  }

  setBlogNavVisible(enabled);

  if (!enabled && gatePage) {
    redirectHome();
  }
}

void applyBlogMenuSetting();
