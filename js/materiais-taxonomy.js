/** Taxonomia de apostilas (Materiais) — fonte única para menu, filtro e admin. */

export const APOSTILAS_LABEL = 'Apostilas';

export const MATERIALS_TREE = [
  {
    name: 'Alfabetização',
    children: ['Educação Infantil', 'Ensino Fundamental 1'],
  },
  {
    name: 'Matemática',
    children: ['Educação Infantil', 'Ensino Fundamental 1'],
  },
  { name: 'Datas Comemorativas', children: [] },
  { name: 'Lembrancinhas', children: [] },
  { name: 'Atividades Avulsas', children: [] },
  { name: 'Desenvolvimento Cognitivo', children: [] },
  { name: 'Raciocínio Lógico', children: [] },
];

export function getCategoryNames() {
  return MATERIALS_TREE.map((node) => node.name);
}

export function getSubcategories(categoryName) {
  const node = MATERIALS_TREE.find((item) => item.name === categoryName);
  return node ? [...node.children] : [];
}

export function hasSubcategories(categoryName) {
  return getSubcategories(categoryName).length > 0;
}

export function isValidCategory(categoryName) {
  return getCategoryNames().includes(categoryName);
}

export function isValidSubcategory(categoryName, subcategoryName) {
  if (!subcategoryName) return true;
  return getSubcategories(categoryName).includes(subcategoryName);
}

export function formatCategoryLabel(category, subcategory = '') {
  const cat = String(category || '').trim();
  const sub = String(subcategory || '').trim();
  if (!cat) return 'Sem categoria';
  if (!sub) return cat;
  return `${cat} · ${sub}`;
}

/**
 * @param {{ category?: string, subcategory?: string, basePath?: string, page?: number }} opts
 */
export function buildFilterUrl(opts = {}) {
  const basePath = opts.basePath || './atividades.html';
  const params = new URLSearchParams();
  const category = String(opts.category || '').trim();
  const subcategory = String(opts.subcategory || '').trim();
  if (category) params.set('category', category);
  if (subcategory) params.set('subcategory', subcategory);
  if (opts.page && opts.page > 1) params.set('page', String(opts.page));
  const query = params.toString();
  return query ? `${basePath}?${query}` : basePath;
}

export function readFilterFromSearch(search = window.location.search) {
  const params = new URLSearchParams(search);
  const category = String(params.get('category') || '').trim();
  const subcategory = String(params.get('subcategory') || '').trim();
  const pageRaw = Number.parseInt(params.get('page') || '1', 10);
  const page = Number.isFinite(pageRaw) && pageRaw > 0 ? pageRaw : 1;
  return { category, subcategory, page };
}
