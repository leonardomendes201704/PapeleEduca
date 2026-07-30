# Automação do blog → moderação (rascunho)

A automação Cursor **não publica mais no ar**. O helper cria posts com `status: draft`.

## Contrato

- Script: `node scripts/blog-automation-helpers.mjs publish --stdin`
- Sempre grava `status: 'draft'` e `published_at: null` (ignora status do payload).
- Moderação: app Android (`mobile/`) ou admin web → **Aprovar** (publica) / **Rejeitar** (apaga).
- Push: webhook Supabase → `POST /api/blog/notify-draft` quando nasce um rascunho.

## Atualizar a Cursor Automation

Nas instruções da automation, garanta:

1. Usar o helper `publish` (não chamar a API com `status: published`).
2. Texto do tipo: “O post deve ficar em **rascunho** para revisão no app de moderação; não publicar no site.”
3. Após o publish, informar `id`, `slug` e `status` retornados (esperado: `draft`).

## SQL + webhook

1. Rode [`supabase-blog-push.sql`](../supabase-blog-push.sql) no SQL Editor.
2. No Supabase → Database → Webhooks → Create:
   - Table: `blog_posts`
   - Events: `INSERT`
   - URL: `https://papele-educa.vercel.app/api/blog/notify-draft`
   - HTTP Headers: `Authorization: Bearer <CRON_SECRET ou BLOG_NOTIFY_SECRET>`
3. Na Vercel, configure `FCM_PROJECT_ID` e `FCM_SERVICE_ACCOUNT_JSON` (JSON da service account Firebase).
