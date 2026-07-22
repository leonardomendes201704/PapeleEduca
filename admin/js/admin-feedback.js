/**
 * Full-screen busy overlay + result dialog for admin async actions.
 */

function ensureFeedbackDom() {
  if (!document.getElementById('admin-busy-modal')) {
    const busy = document.createElement('dialog');
    busy.id = 'admin-busy-modal';
    busy.className = 'admin-busy-modal';
    busy.setAttribute('aria-live', 'assertive');
    busy.innerHTML = `
      <div class="admin-busy-panel">
        <div class="admin-spinner" aria-hidden="true"></div>
        <p id="admin-busy-message">Aguarde...</p>
      </div>
    `;
    document.body.appendChild(busy);
    busy.addEventListener('cancel', (event) => event.preventDefault());
  }

  if (!document.getElementById('admin-result-modal')) {
    const result = document.createElement('dialog');
    result.id = 'admin-result-modal';
    result.className = 'admin-modal admin-result-modal';
    result.innerHTML = `
      <div class="admin-modal-panel admin-result-panel">
        <div class="admin-modal-header">
          <div>
            <p class="admin-result-eyebrow" id="admin-result-eyebrow"></p>
            <h2 id="admin-result-title"></h2>
          </div>
          <button type="button" class="admin-modal-close" id="admin-result-close" aria-label="Fechar">×</button>
        </div>
        <div class="admin-modal-body">
          <p id="admin-result-message" class="admin-result-message"></p>
          <p id="admin-result-link-wrap" class="admin-result-link-wrap" hidden>
            <a id="admin-result-link" href="#" target="_blank" rel="noopener noreferrer"></a>
          </p>
        </div>
        <div class="admin-modal-footer">
          <button type="button" class="btn-primary" id="admin-result-ok">OK</button>
        </div>
      </div>
    `;
    document.body.appendChild(result);

    const close = () => {
      if (result.open) result.close();
    };
    result.querySelector('#admin-result-close')?.addEventListener('click', close);
    result.querySelector('#admin-result-ok')?.addEventListener('click', close);
  }
}

export function showBusyOverlay(message = 'Aguarde...') {
  ensureFeedbackDom();
  const msg = document.getElementById('admin-busy-message');
  if (msg) msg.textContent = message;
  const el = document.getElementById('admin-busy-modal');
  if (el && typeof el.showModal === 'function' && !el.open) {
    el.showModal();
  } else if (el) {
    el.setAttribute('open', '');
  }
}

export function hideBusyOverlay() {
  const el = document.getElementById('admin-busy-modal');
  if (el?.open) el.close();
  else el?.removeAttribute('open');
}

/**
 * @param {{ type?: 'success'|'error', title: string, message: string, linkHref?: string, linkLabel?: string }} options
 */
export function showResultModal(options = {}) {
  ensureFeedbackDom();
  hideBusyOverlay();

  const type = options.type === 'error' ? 'error' : 'success';
  const modal = document.getElementById('admin-result-modal');
  const eyebrow = document.getElementById('admin-result-eyebrow');
  const titleEl = document.getElementById('admin-result-title');
  const messageEl = document.getElementById('admin-result-message');
  const linkWrap = document.getElementById('admin-result-link-wrap');
  const linkEl = document.getElementById('admin-result-link');
  const panel = modal?.querySelector('.admin-result-panel');

  if (panel) {
    panel.classList.toggle('is-error', type === 'error');
    panel.classList.toggle('is-success', type === 'success');
  }
  if (eyebrow) eyebrow.textContent = type === 'error' ? 'Erro' : 'Sucesso';
  if (titleEl) titleEl.textContent = options.title || (type === 'error' ? 'Não foi possível concluir' : 'Concluído');
  if (messageEl) messageEl.textContent = options.message || '';

  if (linkWrap && linkEl && options.linkHref) {
    linkWrap.hidden = false;
    linkEl.href = options.linkHref;
    linkEl.textContent = options.linkLabel || 'Abrir no Facebook';
  } else if (linkWrap) {
    linkWrap.hidden = true;
  }

  if (modal && typeof modal.showModal === 'function') {
    if (!modal.open) modal.showModal();
  } else if (modal) {
    modal.setAttribute('open', '');
  }
}
