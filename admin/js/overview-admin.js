import { supabase } from './supabase-client.js';

function formatPercent(value) {
  return `${Math.round(value * 100)}%`;
}

async function loadOverview() {
  const [
    productsRes,
    freeMaterialsRes,
    productMetricsRes,
    freeMetricsRes,
    blogPostsRes,
    blogMetricsRes,
    blogListingRes,
  ] = await Promise.all([
    supabase.from('products').select('status'),
    supabase.from('free_materials').select('status'),
    supabase.from('product_metrics_report').select('views,buy_clicks'),
    supabase.from('free_material_metrics_report').select('views,downloads'),
    supabase.from('blog_posts').select('status'),
    supabase.from('blog_post_metrics_report').select('views,read_completes'),
    supabase.from('blog_listing_metrics_report').select('views').maybeSingle(),
  ]);

  const products = productsRes.data || [];
  const freeMaterials = freeMaterialsRes.data || [];
  const productMetrics = productMetricsRes.data || [];
  const freeMetrics = freeMetricsRes.data || [];
  const blogPosts = blogPostsRes.data || [];
  const blogMetrics = blogMetricsRes.data || [];

  const totalProducts = products.length;
  const publishedProducts = products.filter((p) => p.status === 'published').length;
  const totalFree = freeMaterials.length;
  const publishedFree = freeMaterials.filter((m) => m.status === 'published').length;
  const publishedBlog = blogPosts.filter((p) => p.status === 'published').length;

  const totalViews = productMetrics.reduce((sum, row) => sum + Number(row.views || 0), 0);
  const totalBuyClicks = productMetrics.reduce((sum, row) => sum + Number(row.buy_clicks || 0), 0);
  const totalDownloads = freeMetrics.reduce((sum, row) => sum + Number(row.downloads || 0), 0);
  const conversion = totalViews > 0 ? totalBuyClicks / totalViews : 0;

  const blogViews = blogMetrics.reduce((sum, row) => sum + Number(row.views || 0), 0);
  const blogReads = blogMetrics.reduce((sum, row) => sum + Number(row.read_completes || 0), 0);
  const blogReadRate = blogViews > 0 ? blogReads / blogViews : 0;
  const blogListingViews = Number(blogListingRes.data?.views || 0);

  const set = (id, value) => {
    const el = document.getElementById(id);
    if (el) el.textContent = value;
  };

  set('overview-products-total', totalProducts);
  set('overview-products-published', publishedProducts);
  set('overview-free-total', totalFree);
  set('overview-free-published', publishedFree);
  set('overview-buy-clicks', totalBuyClicks);
  set('overview-downloads', totalDownloads);
  set('overview-conversion', formatPercent(conversion));
  set('overview-blog-published', publishedBlog);
  set('overview-blog-listing-views', blogListingViews);
  set('overview-blog-views', blogViews);
  set('overview-blog-reads', blogReads);
  set('overview-blog-read-rate', formatPercent(blogReadRate));
}

export async function initOverview() {
  await loadOverview();
}

export async function refreshOverview() {
  await loadOverview();
}
