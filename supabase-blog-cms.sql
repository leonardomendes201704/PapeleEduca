-- Blog CMS schema for Papelê Educa
-- Run in Supabase SQL Editor. Safe to re-run.

-- Categories
create table if not exists public.blog_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  description text not null default '',
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Tags
create table if not exists public.blog_tags (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  created_at timestamptz not null default now()
);

-- Posts
create table if not exists public.blog_posts (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  slug text not null unique,
  excerpt text not null default '',
  content_html text not null default '',
  content_json jsonb,
  status text not null default 'draft'
    check (status in ('draft', 'published', 'scheduled', 'archived')),
  published_at timestamptz,
  cover_path text not null default '',
  cover_url text not null default '',
  og_image_path text not null default '',
  og_image_url text not null default '',
  seo_title text not null default '',
  seo_description text not null default '',
  author_name text not null default 'Papelê Educa',
  reading_time_min integer not null default 0,
  featured boolean not null default false,
  category_id uuid references public.blog_categories(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Post ↔ Tag
create table if not exists public.blog_post_tags (
  post_id uuid not null references public.blog_posts(id) on delete cascade,
  tag_id uuid not null references public.blog_tags(id) on delete cascade,
  primary key (post_id, tag_id)
);

-- Media library
create table if not exists public.blog_media (
  id uuid primary key default gen_random_uuid(),
  path text not null,
  url text not null,
  file_name text not null default '',
  mime_type text not null default '',
  size_bytes bigint not null default 0,
  alt_text text not null default '',
  created_at timestamptz not null default now()
);

create index if not exists blog_posts_status_published_idx
  on public.blog_posts (status, published_at desc nulls last);
create index if not exists blog_posts_category_idx
  on public.blog_posts (category_id);
create index if not exists blog_categories_sort_idx
  on public.blog_categories (sort_order asc, name asc);

alter table public.blog_categories enable row level security;
alter table public.blog_tags enable row level security;
alter table public.blog_posts enable row level security;
alter table public.blog_post_tags enable row level security;
alter table public.blog_media enable row level security;

grant select on public.blog_categories to anon, authenticated;
grant select on public.blog_tags to anon, authenticated;
grant select on public.blog_posts to anon, authenticated;
grant select on public.blog_post_tags to anon, authenticated;
grant select on public.blog_media to anon, authenticated;

grant insert, update, delete on public.blog_categories to authenticated;
grant insert, update, delete on public.blog_tags to authenticated;
grant insert, update, delete on public.blog_posts to authenticated;
grant insert, update, delete on public.blog_post_tags to authenticated;
grant insert, update, delete on public.blog_media to authenticated;

-- Public visibility helper: published OR scheduled whose time has arrived
-- Categories / tags / media: public read
drop policy if exists "Public can read blog categories" on public.blog_categories;
create policy "Public can read blog categories"
on public.blog_categories for select using (true);

drop policy if exists "Admins manage blog categories" on public.blog_categories;
create policy "Admins manage blog categories"
on public.blog_categories for all
using (public.is_admin(auth.uid()))
with check (public.is_admin(auth.uid()));

drop policy if exists "Public can read blog tags" on public.blog_tags;
create policy "Public can read blog tags"
on public.blog_tags for select using (true);

drop policy if exists "Admins manage blog tags" on public.blog_tags;
create policy "Admins manage blog tags"
on public.blog_tags for all
using (public.is_admin(auth.uid()))
with check (public.is_admin(auth.uid()));

drop policy if exists "Public can read visible blog posts" on public.blog_posts;
create policy "Public can read visible blog posts"
on public.blog_posts for select
using (
  status = 'published'
  or (status = 'scheduled' and published_at is not null and published_at <= now())
);

drop policy if exists "Admins can read all blog posts" on public.blog_posts;
create policy "Admins can read all blog posts"
on public.blog_posts for select
using (public.is_admin(auth.uid()));

drop policy if exists "Admins can insert blog posts" on public.blog_posts;
create policy "Admins can insert blog posts"
on public.blog_posts for insert
with check (public.is_admin(auth.uid()));

drop policy if exists "Admins can update blog posts" on public.blog_posts;
create policy "Admins can update blog posts"
on public.blog_posts for update
using (public.is_admin(auth.uid()))
with check (public.is_admin(auth.uid()));

drop policy if exists "Admins can delete blog posts" on public.blog_posts;
create policy "Admins can delete blog posts"
on public.blog_posts for delete
using (public.is_admin(auth.uid()));

drop policy if exists "Public can read blog post tags" on public.blog_post_tags;
create policy "Public can read blog post tags"
on public.blog_post_tags for select using (true);

drop policy if exists "Admins manage blog post tags" on public.blog_post_tags;
create policy "Admins manage blog post tags"
on public.blog_post_tags for all
using (public.is_admin(auth.uid()))
with check (public.is_admin(auth.uid()));

drop policy if exists "Public can read blog media" on public.blog_media;
create policy "Public can read blog media"
on public.blog_media for select using (true);

drop policy if exists "Admins manage blog media" on public.blog_media;
create policy "Admins manage blog media"
on public.blog_media for all
using (public.is_admin(auth.uid()))
with check (public.is_admin(auth.uid()));

-- Storage bucket
insert into storage.buckets (id, name, public)
values ('blog-images', 'blog-images', true)
on conflict (id) do nothing;

drop policy if exists "Public can read blog images" on storage.objects;
create policy "Public can read blog images"
on storage.objects for select
using (bucket_id = 'blog-images');

drop policy if exists "Admins can upload blog images" on storage.objects;
create policy "Admins can upload blog images"
on storage.objects for insert
with check (bucket_id = 'blog-images' and public.is_admin(auth.uid()));

drop policy if exists "Admins can update blog images" on storage.objects;
create policy "Admins can update blog images"
on storage.objects for update
using (bucket_id = 'blog-images' and public.is_admin(auth.uid()))
with check (bucket_id = 'blog-images' and public.is_admin(auth.uid()));

drop policy if exists "Admins can delete blog images" on storage.objects;
create policy "Admins can delete blog images"
on storage.objects for delete
using (bucket_id = 'blog-images' and public.is_admin(auth.uid()));

-- Seed category + first post (idempotent by slug)
-- Categorias completas: rode também supabase-blog-categories-seed.sql (12 categorias).
insert into public.blog_categories (name, slug, description, sort_order)
values (
  'Educação Infantil',
  'educacao-infantil',
  'Práticas, rotinas e reflexões sobre a primeira infância e o trabalho com bebês e crianças pequenas.',
  1
)
on conflict (slug) do nothing;

insert into public.blog_posts (
  title,
  slug,
  excerpt,
  content_html,
  status,
  published_at,
  cover_url,
  og_image_url,
  seo_title,
  seo_description,
  author_name,
  reading_time_min,
  category_id
)
select
  'Brincar e interagir: o que a BNCC e a UNICEF dizem sobre aprender na primeira infância',
  'brincar-interagir-aprender-bncc',
  'Interações e brincadeiras são eixos da BNCC. A UNICEF reforça a aprendizagem pelo brincar como parte central da educação na primeira infância.',
  $html$
<p class="lead">Brincar não é “passar o tempo” na Educação Infantil. Na Base Nacional Comum Curricular (BNCC), interações e brincadeiras são os eixos que estruturam as práticas pedagógicas. Organizações internacionais, como a UNICEF, reforçam o mesmo caminho: a aprendizagem pelo brincar é parte central de uma educação pré-escolar de qualidade.</p>
<h2>O que a BNCC estabelece</h2>
<p>A BNCC é o documento normativo do Ministério da Educação que define as aprendizagens essenciais da Educação Básica. Na Educação Infantil, ela parte de dois eixos estruturantes — <strong>interações</strong> e <strong>brincadeiras</strong> — e assegura seis direitos de aprendizagem e desenvolvimento:</p>
<ul>
<li><strong>Conviver</strong> com outras crianças e adultos, em diferentes grupos e linguagens;</li>
<li><strong>Brincar</strong> de diversas formas, em diferentes espaços, tempos e com diferentes parceiros;</li>
<li><strong>Participar</strong> ativamente do planejamento e da vida cotidiana da escola;</li>
<li><strong>Explorar</strong> movimentos, sons, formas, texturas, histórias, natureza e cultura;</li>
<li><strong>Expressar</strong> necessidades, emoções, hipóteses e opiniões por diferentes linguagens;</li>
<li><strong>Conhecer-se</strong>, construindo identidade pessoal, social e cultural.</li>
</ul>
<p>A partir desses direitos, a BNCC organiza o currículo em cinco <strong>campos de experiências</strong>: O eu, o outro e o nós; Corpo, gestos e movimentos; Traços, sons, cores e formas; Escuta, fala, pensamento e imaginação; e Espaços, tempos, quantidades, relações e transformações.</p>
<blockquote><p>Em outras palavras: o documento não trata o brincar como enfeite da rotina. Ele é o meio privilegiado pelo qual a criança convive, explora, se expressa e constrói conhecimento.</p></blockquote>
<h2>O que a UNICEF reforça sobre a primeira infância</h2>
<p>A UNICEF destaca a primeira infância — da concepção até os 6 anos — como uma janela decisiva para saúde, aprendizado e bem-estar social e emocional.</p>
<p>Em publicação conjunta com a Lego Foundation, a UNICEF defende a <strong>aprendizagem pelo brincar</strong> como elemento central da pedagogia pré-escolar de qualidade.</p>
<h2>Como traduzir isso na prática</h2>
<ul>
<li><strong>Planejar com intenção.</strong> Pergunte quais direitos e campos de experiência a atividade mobiliza.</li>
<li><strong>Valorizar a participação infantil.</strong> Escolha de materiais e espaços faz parte do direito de participar.</li>
<li><strong>Diversificar linguagens.</strong> Desenho, música, movimento e faz de conta ampliam a expressão.</li>
<li><strong>Observar e documentar.</strong> Registre como a criança interage e formula hipóteses.</li>
</ul>
$html$,
  'published',
  '2026-07-21T08:00:00-03:00'::timestamptz,
  'https://papele-educa.vercel.app/images/blog-brincar-bncc.png',
  'https://papele-educa.vercel.app/images/blog-brincar-bncc-og.jpg',
  'Brincar e interagir: o que a BNCC e a UNICEF dizem sobre aprender na primeira infância',
  'Interações e brincadeiras são eixos da BNCC. A UNICEF reforça a aprendizagem pelo brincar na primeira infância.',
  'Papelê Educa',
  6,
  c.id
from public.blog_categories c
where c.slug = 'educacao-infantil'
  and not exists (
    select 1 from public.blog_posts p where p.slug = 'brincar-interagir-aprender-bncc'
  );

-- Ensure blog_menu_enabled column exists
alter table public.site_settings
  add column if not exists blog_menu_enabled boolean not null default true;
