-- Products: subcategory + intelligent backfill into Apostilas taxonomy
-- Run once in Supabase SQL Editor. Safe to re-run (updates only when mapping differs).

alter table public.products
  add column if not exists subcategory text not null default '';

create index if not exists products_category_subcategory_idx
  on public.products (category, subcategory);

create or replace function public.normalize_pt(input text)
returns text
language sql
immutable
as $$
  select translate(
    lower(coalesce(input, '')),
    'áàâãäéèêëíìîïóòôõöúùûüçń',
    'aaaaaeeeeiiiiooooouuuucn'
  );
$$;

with source as (
  select
    p.id,
    public.normalize_pt(coalesce(p.category, '')) as cat_norm,
    public.normalize_pt(
      coalesce(p.category, '') || ' ' || coalesce(p.title, '') || ' ' || left(coalesce(p.description, ''), 200)
    ) as blob
  from public.products p
),
categorized as (
  select
    id,
    blob,
    case
      when cat_norm in (
        'alfabetizacao',
        'matematica',
        'datas comemorativas',
        'lembrancinhas',
        'atividades avulsas',
        'desenvolvimento cognitivo',
        'raciocinio logico'
      ) then cat_norm
      when blob ~ '(alfabet|letra|leitura|escrita|letramento|silaba|fonema)' then 'alfabetizacao'
      when blob ~ '(matem|numero|numerac|quantidade|contagem|adicao|subtracao|multiplic|divisao)' then 'matematica'
      when blob ~ '(comemorativ|pascoa|natal|carnaval|folclore|independencia|halloween|dia das maes|dia dos pais|dia das criancas)' then 'datas comemorativas'
      when blob ~ 'lembranc' then 'lembrancinhas'
      when blob ~ 'avuls' then 'atividades avulsas'
      when blob ~ '(cognitiv|memoria|atencao|percepcao)' then 'desenvolvimento cognitivo'
      when blob ~ '(racioc|logic)' then 'raciocinio logico'
      else null
    end as cat_key
  from source
),
mapped as (
  select
    id,
    case cat_key
      when 'alfabetizacao' then 'Alfabetização'
      when 'matematica' then 'Matemática'
      when 'datas comemorativas' then 'Datas Comemorativas'
      when 'lembrancinhas' then 'Lembrancinhas'
      when 'atividades avulsas' then 'Atividades Avulsas'
      when 'desenvolvimento cognitivo' then 'Desenvolvimento Cognitivo'
      when 'raciocinio logico' then 'Raciocínio Lógico'
      else null
    end as matched_category,
    case
      when cat_key in ('alfabetizacao', 'matematica')
        and blob ~ '(fundamental|ef ?1|1o ano|1º|anos iniciais)'
        then 'Ensino Fundamental 1'
      when cat_key in ('alfabetizacao', 'matematica')
        and blob ~ '(infantil|bercar|berçar|pre[- ]?escola|creche)'
        then 'Educação Infantil'
      else ''
    end as matched_subcategory
  from categorized
  where cat_key is not null
)
update public.products p
set
  category = m.matched_category,
  subcategory = m.matched_subcategory,
  updated_at = now()
from mapped m
where p.id = m.id
  and (
    p.category is distinct from m.matched_category
    or p.subcategory is distinct from m.matched_subcategory
  );

-- Relatório: contagem por categoria/subcategoria
select category, subcategory, count(*) as total
from public.products
group by category, subcategory
order by category, subcategory;

-- Relatório: produtos fora da taxonomia (revisar no admin)
select id, title, category, subcategory
from public.products
where trim(coalesce(category, '')) = ''
   or category not in (
     'Alfabetização',
     'Matemática',
     'Datas Comemorativas',
     'Lembrancinhas',
     'Atividades Avulsas',
     'Desenvolvimento Cognitivo',
     'Raciocínio Lógico'
   )
order by title;
