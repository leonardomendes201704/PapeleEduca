/**
 * Helpers for the Cursor Automation that publishes one blog post on a schedule.
 * Category cycling + duplicate-title checks against live Supabase data.
 *
 * Usage:
 *   node scripts/blog-automation-helpers.mjs next-category
 *   node scripts/blog-automation-helpers.mjs recent-titles
 *   node scripts/blog-automation-helpers.mjs publish --stdin   # JSON on stdin
 *
 * Env:
 *   BLOG_API_KEY (required for publish)
 *   BLOG_API_BASE (default https://papele-educa.vercel.app)
 *   SUPABASE_URL / SUPABASE_ANON_KEY optional overrides
 */
import { createInterface } from 'node:readline';

const BASE = (process.env.BLOG_API_BASE || 'https://papele-educa.vercel.app').replace(/\/$/, '');
const SUPABASE_URL = (process.env.SUPABASE_URL || 'https://ykauyuccbxumtqnxeqna.supabase.co').replace(/\/$/, '');
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || 'sb_publishable_afdZ3S2KNBNOoJRDmO3Mxw_ThEreicp';
const API_KEY = process.env.BLOG_API_KEY || '';

const CATEGORY_ORDER = [
  { name: 'Educação Infantil', slug: 'educacao-infantil' },
  { name: 'BNCC na prática', slug: 'bncc-na-pratica' },
  { name: 'Brincar e interações', slug: 'brincar-e-interacoes' },
  { name: 'Alfabetização e letramento', slug: 'alfabetizacao-e-letramento' },
  { name: 'Matemática lúdica', slug: 'matematica-ludica' },
  { name: 'Arte e expressão', slug: 'arte-e-expressao' },
  { name: 'Socioemocional', slug: 'socioemocional' },
  { name: 'Família e escola', slug: 'familia-e-escola' },
  { name: 'Inclusão e diversidade', slug: 'inclusao-e-diversidade' },
  { name: 'Rotina e organização', slug: 'rotina-e-organizacao' },
  { name: 'Materiais pedagógicos', slug: 'materiais-pedagogicos' },
  { name: 'Ideias prontas', slug: 'ideias-prontas' },
];

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
    `blog_posts?select=title,slug,category_id,published_at,status&order=created_at.desc&limit=${limit}`,
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

  return {
    ...best,
    postsInCategory: bestCount,
    recentTitles: posts.slice(0, 40).map((p) => p.title),
    recentSlugs: posts.slice(0, 40).map((p) => p.slug),
  };
}

export async function publishPost(payload) {
  if (!API_KEY) throw new Error('BLOG_API_KEY is required');
  const res = await fetch(`${BASE}/api/blog/posts`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'X-API-Key': API_KEY,
    },
    body: JSON.stringify({
      status: 'published',
      author_name: 'Papelê Educa',
      ...payload,
    }),
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
    console.log(JSON.stringify(rows.map((r) => ({ title: r.title, slug: r.slug })), null, 2));
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
