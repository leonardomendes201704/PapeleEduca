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

## 5. Public products

Only rows with `status = 'published'` are visible to the public site when it is connected to Supabase.

