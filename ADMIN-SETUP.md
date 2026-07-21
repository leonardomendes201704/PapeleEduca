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
4. O cron chama `/api/metrics-report` a cada hora; o e-mail só sai no horário configurado (e no máximo 1x por dia).

> O plano Hobby da Vercel só permite cron diário. Para horário configurável no admin, use o cron horário (`0 * * * *`) no plano Pro.

## 5. Public products

Only rows with `status = 'published'` are visible to the public site when it is connected to Supabase.

