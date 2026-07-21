import { supabase } from './supabase-client.js';

const form = document.getElementById('blog-settings-form');
const toggleEl = document.getElementById('blog-menu-enabled');
const statusEl = document.getElementById('blog-status');
const stateLabelEl = document.getElementById('blog-menu-state-label');

let bound = false;

function setStatus(message, isError = false) {
  if (!statusEl) return;
  statusEl.textContent = message || '';
  statusEl.className = isError ? 'form-status error' : 'form-status';
}

function syncStateLabel(enabled) {
  if (!stateLabelEl) return;
  stateLabelEl.textContent = enabled ? 'Menu Blog visível no site' : 'Menu Blog oculto no site';
  stateLabelEl.dataset.state = enabled ? 'on' : 'off';
}

async function loadBlogSettings() {
  if (!form || !toggleEl) return;

  const { data, error } = await supabase
    .from('site_settings')
    .select('blog_menu_enabled')
    .eq('id', 1)
    .maybeSingle();

  if (error) {
    setStatus(`Erro ao carregar configuração do blog: ${error.message}`, true);
    return;
  }

  const enabled = data?.blog_menu_enabled !== false;
  toggleEl.checked = enabled;
  syncStateLabel(enabled);
  setStatus('');
}

function bindBlogForm() {
  if (bound || !form || !toggleEl) return;
  bound = true;

  toggleEl.addEventListener('change', () => {
    syncStateLabel(toggleEl.checked);
  });

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    setStatus('Salvando...');

    try {
      const payload = {
        id: 1,
        blog_menu_enabled: Boolean(toggleEl.checked),
        updated_at: new Date().toISOString(),
      };

      const { error } = await supabase
        .from('site_settings')
        .upsert(payload, { onConflict: 'id' });

      if (error) throw error;

      syncStateLabel(payload.blog_menu_enabled);
      setStatus('Configuração do blog salva com sucesso.');
    } catch (error) {
      setStatus(error.message || 'Não foi possível salvar.', true);
    }
  });
}

export async function initBlogSettings() {
  if (!form) return;
  bindBlogForm();
  await loadBlogSettings();
}
