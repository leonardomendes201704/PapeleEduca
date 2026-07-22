import { showResultModal } from './admin-feedback.js';

const STEP_DELAY_MS = 550;

function $(id) {
  return document.getElementById(id);
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function buildMockContent(topic) {
  const title = topic.trim();
  const slides = [
    { n: '01', label: title, icon: 'fa-arrow-right' },
    { n: '02', label: 'Conteúdo em Vídeo', icon: 'fa-play' },
    { n: '03', label: 'Busca por Voz e SEO', icon: 'fa-microphone' },
    { n: '04', label: 'Comunidades e Engajamento', icon: 'fa-users' },
    { n: '05', label: 'Personalização com Dados', icon: 'fa-chart-line' },
  ];

  const blogBullets = [
    'Inteligência Artificial e Automação',
    'Conteúdo em formatos curtos e vídeos',
    'Busca por voz e SEO conversacional',
    'Comunidades e marketing de relacionamento',
    'Personalização baseada em dados',
  ];

  const blogFull = [
    `<p>O tema <strong>${escapeHtml(title)}</strong> segue no centro das conversas de quem cria conteúdo para educar e engajar famílias e escolas.</p>`,
    '<p>Neste post, reunimos pontos práticos para transformar o assunto em posts, carrosséis e artigos prontos para publicar.</p>',
    '<ol>',
    ...blogBullets.map((item, i) => `<li><strong>${i + 1}. ${escapeHtml(item)}</strong> — aplique com exemplos reais do seu público e da sua rotina pedagógica.</li>`),
    '</ol>',
    '<p>Quer ir além? Combine um artigo no blog com um post curto no Facebook e um carrossel no Instagram para reforçar a mesma mensagem em canais diferentes.</p>',
  ].join('');

  const blogExcerpt = [
    `<p><strong>${escapeHtml(title)}</strong></p>`,
    '<ol>',
    ...blogBullets.slice(0, 3).map((item, i) => `<li>${i + 1}. ${escapeHtml(item)}</li>`),
    '</ol>',
    '<p class="gerar-ia-fade">…</p>',
  ].join('');

  const fbText = [
    `✨ ${title}`,
    '',
    'O cenário muda rápido — e quem se antecipa colhe resultados.',
    '',
    '📌 IA e automação no dia a dia',
    '📌 Vídeo curto que educa e engaja',
    '📌 SEO e busca por voz',
    '',
    'Salve este post e compartilhe com a equipe! 💙',
    '',
    '#conteudo #educacao #marketingdigital',
  ].join('\n');

  return { title, blogExcerpt, blogFull, fbText, slides };
}

function resetSteps() {
  const steps = $('gerar-ia-steps');
  if (!steps) return;
  steps.hidden = true;
  steps.querySelectorAll('.gerar-ia-step').forEach((step) => {
    step.classList.remove('is-active', 'is-done');
  });
}

async function runSteps() {
  const steps = $('gerar-ia-steps');
  if (!steps) return;
  steps.hidden = false;
  const items = [...steps.querySelectorAll('.gerar-ia-step')];
  for (const step of items) {
    step.classList.add('is-active');
    await sleep(STEP_DELAY_MS);
    step.classList.remove('is-active');
    step.classList.add('is-done');
  }
}

function renderCarousel(slides) {
  const track = $('gerar-ia-ig-track');
  const dots = $('gerar-ia-ig-dots');
  const full = $('gerar-ia-ig-full');
  if (!track || !dots) return;

  track.innerHTML = slides
    .map(
      (slide, index) => `
      <div class="gerar-ia-ig-slide${index === 0 ? ' is-active' : ''}" data-slide="${index}">
        <span class="gerar-ia-ig-slide-n">${escapeHtml(slide.n)}</span>
        <p>${escapeHtml(slide.label)}</p>
        <i class="fa-solid ${slide.icon}" aria-hidden="true"></i>
      </div>`
    )
    .join('');

  dots.innerHTML = slides
    .map((_, index) => `<button type="button" class="gerar-ia-ig-dot${index === 0 ? ' is-active' : ''}" data-dot="${index}" aria-label="Slide ${index + 1}"></button>`)
    .join('');

  if (full) {
    full.innerHTML = `
      <ol class="gerar-ia-ig-full-list">
        ${slides.map((slide) => `<li><strong>${escapeHtml(slide.n)}</strong> — ${escapeHtml(slide.label)}</li>`).join('')}
      </ol>`;
  }

  track.dataset.index = '0';
}

function setCarouselIndex(index) {
  const track = $('gerar-ia-ig-track');
  const dots = $('gerar-ia-ig-dots');
  if (!track) return;
  const slides = [...track.querySelectorAll('.gerar-ia-ig-slide')];
  if (!slides.length) return;
  const next = ((index % slides.length) + slides.length) % slides.length;
  track.dataset.index = String(next);
  slides.forEach((slide, i) => slide.classList.toggle('is-active', i === next));
  dots?.querySelectorAll('.gerar-ia-ig-dot').forEach((dot, i) => {
    dot.classList.toggle('is-active', i === next);
  });
  const offset = next * (slides[0].offsetWidth + 12);
  track.scrollTo({ left: offset, behavior: 'smooth' });
}

function fillResults(content) {
  const blogTitle = $('gerar-ia-blog-title');
  const blogExcerpt = $('gerar-ia-blog-excerpt');
  const blogFull = $('gerar-ia-blog-full');
  const fbText = $('gerar-ia-fb-text');
  const fbImageTitle = $('gerar-ia-fb-image-title');

  if (blogTitle) blogTitle.textContent = content.title;
  if (blogExcerpt) blogExcerpt.innerHTML = content.blogExcerpt;
  if (blogFull) {
    blogFull.innerHTML = content.blogFull;
    blogFull.hidden = true;
  }
  if (fbText) fbText.textContent = content.fbText;
  if (fbImageTitle) fbImageTitle.textContent = content.title;

  renderCarousel(content.slides);

  const igFull = $('gerar-ia-ig-full');
  if (igFull) igFull.hidden = true;

  const results = $('gerar-ia-results');
  if (results) results.hidden = false;
}

async function handleGenerate(event) {
  event.preventDefault();
  const input = $('gerar-ia-topic');
  const submit = $('gerar-ia-submit');
  const topic = input?.value?.trim();
  if (!topic) {
    input?.focus();
    return;
  }

  const results = $('gerar-ia-results');
  if (results) results.hidden = true;
  resetSteps();

  if (submit) {
    submit.disabled = true;
    submit.classList.add('is-loading');
  }

  try {
    await runSteps();
    fillResults(buildMockContent(topic));
  } finally {
    if (submit) {
      submit.disabled = false;
      submit.classList.remove('is-loading');
    }
  }
}

function handleApprove() {
  showResultModal({
    type: 'success',
    title: 'Conteúdo aprovado (simulação)',
    message: 'Simulação: o conteúdo foi marcado como aprovado. Nesta versão demo nada é publicado no blog, Facebook ou Instagram.',
  });
}

export function initGerarIa() {
  const form = $('gerar-ia-form');
  if (!form || form.dataset.bound === '1') return;
  form.dataset.bound = '1';

  form.addEventListener('submit', (event) => {
    void handleGenerate(event);
  });

  $('gerar-ia-approve')?.addEventListener('click', handleApprove);

  $('gerar-ia-blog-expand')?.addEventListener('click', () => {
    const panel = $('gerar-ia-blog-full');
    if (!panel) return;
    panel.hidden = !panel.hidden;
  });

  $('gerar-ia-ig-expand')?.addEventListener('click', () => {
    const panel = $('gerar-ia-ig-full');
    if (!panel) return;
    panel.hidden = !panel.hidden;
  });

  $('gerar-ia-ig-next')?.addEventListener('click', () => {
    const track = $('gerar-ia-ig-track');
    const current = Number(track?.dataset.index || 0);
    setCarouselIndex(current + 1);
  });

  $('gerar-ia-ig-dots')?.addEventListener('click', (event) => {
    const btn = event.target.closest('[data-dot]');
    if (!btn) return;
    setCarouselIndex(Number(btn.dataset.dot));
  });
}
