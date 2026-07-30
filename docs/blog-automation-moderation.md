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

## SQL + notificação (sem Database Webhook)

Alguns projetos Supabase falham ao criar Webhooks (`schema "supabase_functions" does not exist`).
Neste caso **não use webhook** — o push é disparado por:

1. `POST /api/blog/posts` (automação) → chama `/api/blog/notify-draft` após criar draft
2. Admin web ao salvar um post novo em rascunho → mesma API (Bearer da sessão admin)

Setup:

1. Rode [`supabase-blog-push.sql`](../supabase-blog-push.sql) no SQL Editor.
2. Na Vercel: `FCM_PROJECT_ID`, `FCM_SERVICE_ACCOUNT_JSON`, e `BLOG_NOTIFY_SECRET` (ou `CRON_SECRET`).
3. Redeploy. Teste criando um rascunho no admin ou pela API.
