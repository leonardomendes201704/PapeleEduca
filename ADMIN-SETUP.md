# Admin setup

This project uses Supabase for authentication, database and storage.

## 1. Create the Supabase objects

1. Open the Supabase SQL editor.
2. Run [`supabase-schema.sql`](./supabase-schema.sql).
3. Create a storage bucket named `product-images` if it was not created automatically.

## 2. Configure the admin app

Edit [`admin/js/config.js`](./admin/js/config.js) with:

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`

## 3. Create the first admin user

1. Create a user in Supabase Auth.
2. Find that user's `id` in the Auth users table.
3. Mark the user as admin in `profiles`:

```sql
update public.profiles
set role = 'admin'
where id = 'USER_UUID_HERE';
```

## 4. Deploy

- Push the repository to GitHub.
- Connect the repo to Vercel.
- Set the same Supabase URL and anon key in the deployed admin files.

### Relatório de métricas por e-mail

1. No SQL Editor do Supabase, execute [`supabase-metrics-email.sql`](./supabase-metrics-email.sql).
2. Na Vercel, configure as variáveis de ambiente (reaproveitam o SMTP do contato):
   - `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`
   - `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_ANON_KEY`
   - `CRON_SECRET` (string aleatória; a Vercel envia no header `Authorization` do cron)
3. No admin, em **Configurações**, ligue o envio, defina o horário (BRT) e os destinatários.
4. A Vercel chama `/api/metrics-report` a cada hora UTC (24 crons diários, compatível com o plano Hobby); o e-mail só sai no horário configurado em Brasília (e no máximo 1x por dia).

> No plano Hobby não é permitido `0 * * * *` (cron horário). Por isso usamos 24 expressões diárias (`0 0` … `0 23`).

### Postar no Facebook (manual, pelo admin)

Publicação **manual** pela tabela de posts do CMS (botão **Postar no Facebook**). Não há postagem automática.

1. No SQL Editor do Supabase, execute [`supabase-blog-facebook.sql`](./supabase-blog-facebook.sql).
2. Crie um app em [Meta for Developers](https://developers.facebook.com/) e obtenha um **Page Access Token** com as permissões `pages_manage_posts`, `pages_read_engagement` e `pages_show_list`.
3. Na Vercel, configure:
   - `FACEBOOK_PAGE_ID` — ID numérico da Página
   - `FACEBOOK_PAGE_ACCESS_TOKEN` — token da Página (longa duração)
   - `SITE_URL` (opcional) — ex.: `https://papele-educa.vercel.app`
4. Redeploy. No admin → Blog → Posts, use **Postar no Facebook** (só em posts publicados).
5. Para medir cliques vindos do Facebook, execute também [`supabase-blog-facebook-metrics.sql`](./supabase-blog-facebook-metrics.sql). Os links postados incluem UTM (`utm_source=facebook`) e o admin mostra a coluna **FB** / KPI **Views do Facebook**.
6. Para produtos, execute [`supabase-products-facebook.sql`](./supabase-products-facebook.sql). No admin → Produtos, use **Postar no Facebook** / **Excluir postagem** (mesmo fluxo do blog; o link aponta para `product.html?id=...` com UTM).

## 5. Public products

Only rows with `status = 'published'` are visible to the public site when it is connected to Supabase.

