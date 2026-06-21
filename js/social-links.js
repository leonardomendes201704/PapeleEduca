import { supabase } from './supabase-client.js';

const DEFAULT_LINKS = {
  instagram_url: '',
  facebook_url: '',
};

const SOCIAL_MARKUP = `
  <a class="social-link" href="#" data-social-network="instagram" aria-label="Instagram" title="Instagram">
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M7.5 2h9A5.5 5.5 0 0 1 22 7.5v9a5.5 5.5 0 0 1-5.5 5.5h-9A5.5 5.5 0 0 1 2 16.5v-9A5.5 5.5 0 0 1 7.5 2Zm0 2A3.5 3.5 0 0 0 4 7.5v9A3.5 3.5 0 0 0 7.5 20h9a3.5 3.5 0 0 0 3.5-3.5v-9A3.5 3.5 0 0 0 16.5 4h-9ZM12 6.8A5.2 5.2 0 1 1 6.8 12 5.21 5.21 0 0 1 12 6.8Zm0 2A3.2 3.2 0 1 0 15.2 12 3.2 3.2 0 0 0 12 8.8Zm5.6-3a1.2 1.2 0 1 1-1.2 1.2 1.2 1.2 0 0 1 1.2-1.2Z"/>
    </svg>
  </a>
  <a class="social-link" href="#" data-social-network="facebook" aria-label="Facebook" title="Facebook">
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M13.5 22v-8h2.7l.4-3.1h-3.1V8.8c0-.9.3-1.5 1.6-1.5h1.6V4.6c-.7-.1-1.6-.2-2.7-.2-2.7 0-4.5 1.6-4.5 4.6V11H7.3V14H10v8h3.5Z"/>
    </svg>
  </a>
`;

function normalizeUrl(value) {
  const url = String(value || '').trim();
  if (!url) return '';
  if (/^(https?:)?\/\//i.test(url) || /^(mailto:|tel:|#)/i.test(url)) return url;
  return `https://${url}`;
}

function applyLink(anchor, url, label) {
  if (!anchor) return;

  const href = normalizeUrl(url);
  anchor.href = href || '#';
  anchor.target = href ? '_blank' : '';
  anchor.rel = href ? 'noopener noreferrer' : '';
  anchor.title = label;
  anchor.setAttribute('aria-label', label);

  if (!href) {
    anchor.setAttribute('aria-disabled', 'true');
    anchor.tabIndex = -1;
  } else {
    anchor.removeAttribute('aria-disabled');
    anchor.tabIndex = 0;
  }
}

async function loadSocialLinks() {
  const containers = document.querySelectorAll('.socials');
  if (!containers.length) return;

  const { data, error } = await supabase
    .from('site_settings')
    .select('instagram_url,facebook_url')
    .eq('id', 1)
    .maybeSingle();

  const links = { ...DEFAULT_LINKS, ...(error ? {} : data || {}) };

  containers.forEach((container) => {
    if (!container.querySelector('[data-social-network]')) {
      container.innerHTML = SOCIAL_MARKUP;
    }

    applyLink(container.querySelector('[data-social-network="instagram"]'), links.instagram_url, 'Instagram');
    applyLink(container.querySelector('[data-social-network="facebook"]'), links.facebook_url, 'Facebook');
  });
}

void loadSocialLinks();
