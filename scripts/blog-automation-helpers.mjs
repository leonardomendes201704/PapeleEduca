/**
 * Helpers for the Cursor Automation that publishes one blog post on a schedule.
 * Category cycling, default cover_url per category, and publish via API.
 *
 * Usage:
 *   node scripts/blog-automation-helpers.mjs next-category
 *   node scripts/blog-automation-helpers.mjs recent-titles
 *   node scripts/blog-automation-helpers.mjs list-covers
 *   node scripts/blog-automation-helpers.mjs publish --stdin   # JSON on stdin
 *
 * Env:
 *   BLOG_API_KEY (required for publish)
 *   BLOG_API_BASE (default https://papele-educa.vercel.app)
 *   SUPABASE_URL / SUPABASE_ANON_KEY optional overrides
 */
import { readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const IMAGES_DIR = join(__dirname, '..', 'images');

const BASE = (process.env.BLOG_API_BASE || 'https://papele-educa.vercel.app').replace(/\/$/, '');
const SUPABASE_URL = (process.env.SUPABASE_URL || 'https://ykauyuccbxumtqnxeqna.supabase.co').replace(/\/$/, '');
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || 'sb_publishable_afdZ3S2KNBNOoJRDmO3Mxw_ThEreicp';
const API_KEY = process.env.BLOG_API_KEY || '';

const CATEGORY_ORDER = [
  { name: 'Educação Infantil', slug: 'educacao-infantil', cover: 'blog-observacao-doc.png' },
  { name: 'BNCC na prática', slug: 'bncc-na-pratica', cover: 'blog-bncc-planejamento.png' },
  { name: 'Brincar e interações', slug: 'brincar-e-interacoes', cover: 'blog-faz-de-conta.png' },
  { name: 'Alfabetização e letramento', slug: 'alfabetizacao-e-letramento', cover: 'blog-letramento.png' },
  { name: 'Matemática lúdica', slug: 'matematica-ludica', cover: 'blog-matematica-concreta.png' },
  { name: 'Arte e expressão', slug: 'arte-e-expressao', cover: 'blog-arte-atelier.png' },
  { name: 'Socioemocional', slug: 'socioemocional', cover: 'blog-socioemocional.png' },
  { name: 'Família e escola', slug: 'familia-e-escola', cover: 'blog-familia-escola.png' },
  { name: 'Inclusão e diversidade', slug: 'inclusao-e-diversidade', cover: 'blog-inclusao.png' },
  { name: 'Rotina e organização', slug: 'rotina-e-organizacao', cover: 'blog-rotina-acolhida.png' },
  { name: 'Materiais pedagógicos', slug: 'materiais-pedagogicos', cover: 'blog-materiais.png' },
  { name: 'Ideias prontas', slug: 'ideias-prontas', cover: 'blog-ideias-natureza.png' },
];

const FALLBACK_COVERS = [
  'blog-brincar-bncc.png',
  'blog-seis-direitos-bncc.png',
  'blog-bncc-planejamento.png',
  'blog-observacao-doc.png',
];

function coverUrlForFile(file) {
  return `${BASE}/images/${file}`;
}

function listAvailableCoverFiles() {
  try {
    return readdirSync(IMAGES_DIR)
      .filter((name) => /^blog-.*\.(png|jpe?g|webp)$/i.test(name))
      .sort();
  } catch {
    const known = new Set([
      ...CATEGORY_ORDER.map((c) => c.cover),
      ...FALLBACK_COVERS,
    ]);
    return [...known].sort();
  }
}

export function listAvailableCovers() {
  return listAvailableCoverFiles().map((file) => ({
    file,
    url: coverUrlForFile(file),
  }));
}

function countCoverUsage(posts) {
  const counts = Object.create(null);
  for (const post of posts) {
    const file = String(post.cover_url || '').split('/').pop();
    if (file) counts[file] = (counts[file] || 0) + 1;
  }
  return counts;
}

function resolveCoverUrl({ categorySlug, categoryName, coverUrl, avoidUrl } = {}) {
  const explicit = String(coverUrl || '').trim();
  if (explicit) return explicit;

  const bySlug = CATEGORY_ORDER.find((c) => c.slug === categorySlug);
  const byName = CATEGORY_ORDER.find(
    (c) => c.name.toLowerCase() === String(categoryName || '').trim().toLowerCase(),
  );
  const preferred = bySlug || byName;
  if (preferred?.cover) {
    const url = coverUrlForFile(preferred.cover);
    if (url !== avoidUrl) return url;
  }

  for (const file of FALLBACK_COVERS) {
    const url = coverUrlForFile(file);
    if (url !== avoidUrl) return url;
  }
  return coverUrlForFile(FALLBACK_COVERS[0]);
}

async function supabaseSelect(path) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
    },
  });
  if (!res.ok) throw new Error(`Supabase ${res.status}: ${await res.text()}`);
  return res.json();
}

export async function listRecentTitles(limit = 80) {
  const rows = await supabaseSelect(
    `blog_posts?select=title,slug,category_id,cover_url,published_at,status&order=created_at.desc&limit=${limit}`,
  );
  return rows || [];
}

export async function pickNextCategory() {
  const posts = await listRecentTitles(200);
  const counts = Object.fromEntries(CATEGORY_ORDER.map((c) => [c.slug, 0]));
  const cats = await supabaseSelect('blog_categories?select=id,slug,name');
  const idToSlug = Object.fromEntries((cats || []).map((c) => [c.id, c.slug]));

  for (const post of posts) {
    const slug = idToSlug[post.category_id];
    if (slug && counts[slug] != null) counts[slug] += 1;
  }

  // Prefer the category with fewest posts; ties keep CATEGORY_ORDER.
  let best = CATEGORY_ORDER[0];
  let bestCount = counts[best.slug];
  for (const cat of CATEGORY_ORDER) {
    if (counts[cat.slug] < bestCount) {
      best = cat;
      bestCount = counts[cat.slug];
    }
  }

  const recentPosts = posts.slice(0, 40);
  const recentCoverUrls = [...new Set(
    recentPosts.map((p) => String(p.cover_url || '').trim()).filter(Boolean),
  )];
  const recentCoverFiles = recentCoverUrls.map((url) => url.split('/').pop());
  const coverUsage = countCoverUsage(posts);
  const availableCovers = listAvailableCovers().map(({ file, url }) => ({
    file,
    url,
    usedInLast200Posts: coverUsage[file] || 0,
    usedRecently: recentCoverFiles.includes(file),
  }));

  const cover_url = resolveCoverUrl({
    categorySlug: best.slug,
    categoryName: best.name,
  });

  return {
    ...best,
    cover_url,
    cover_file: best.cover,
    default_cover_url: cover_url,
    postsInCategory: bestCount,
    recentTitles: recentPosts.map((p) => p.title),
    recentSlugs: recentPosts.map((p) => p.slug),
    recentCoverUrls,
    recentCoverFiles,
    availableCovers,
    coverSelectionHint:
      'Prefer generate a new cover for this post. If reusing, pick from availableCovers where usedRecently is false and the image matches the topic.',
  };
}

export async function publishPost(payload) {
  if (!API_KEY) throw new Error('BLOG_API_KEY is required');

  const category = String(payload.category || '').trim();
  const categorySlug = String(payload.category_slug || '').trim();
  const cover_url = resolveCoverUrl({
    categorySlug,
    categoryName: category,
    coverUrl: payload.cover_url,
  });
  const og_image_url = String(payload.og_image_url || cover_url).trim();

  const body = {
    status: 'published',
    author_name: 'Papelê Educa',
    ...payload,
    cover_url,
    og_image_url,
  };

  const res = await fetch(`${BASE}/api/blog/posts`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'X-API-Key': API_KEY,
    },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch { data = { raw: text }; }
  if (!res.ok) throw new Error(`Publish failed ${res.status}: ${data.error || text}`);
  return data;
}

async function readStdinJson() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString('utf8').trim();
  if (!raw) throw new Error('Expected JSON on stdin');
  return JSON.parse(raw);
}

async function main() {
  const cmd = process.argv[2] || 'next-category';
  if (cmd === 'next-category') {
    console.log(JSON.stringify(await pickNextCategory(), null, 2));
    return;
  }
  if (cmd === 'recent-titles') {
    const rows = await listRecentTitles(60);
    console.log(JSON.stringify(rows.map((r) => ({
      title: r.title,
      slug: r.slug,
      cover_url: r.cover_url,
    })), null, 2));
    return;
  }
  if (cmd === 'list-covers') {
    const posts = await listRecentTitles(200);
    const coverUsage = countCoverUsage(posts);
    const recentCoverFiles = new Set(
      posts.slice(0, 15).map((p) => String(p.cover_url || '').split('/').pop()).filter(Boolean),
    );
    console.log(JSON.stringify(
      listAvailableCovers().map(({ file, url }) => ({
        file,
        url,
        usedInLast200Posts: coverUsage[file] || 0,
        usedRecently: recentCoverFiles.has(file),
      })),
      null,
      2,
    ));
    return;
  }
  if (cmd === 'publish') {
    const payload = process.argv.includes('--stdin')
      ? await readStdinJson()
      : JSON.parse(process.argv[3] || '{}');
    const result = await publishPost(payload);
    console.log(JSON.stringify(result, null, 2));
    return;
  }
  throw new Error(`Unknown command: ${cmd}`);
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
