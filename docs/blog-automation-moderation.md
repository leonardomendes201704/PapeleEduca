# Automação do blog → moderação (rascunho)

A automação Cursor **não publica mais no ar**. O helper cria posts com `status: draft`.

## Contrato

- Script: `node scripts/blog-automation-helpers.mjs publish --stdin`
- A API `POST /api/blog/posts` **sempre** cria `status: draft` (mesmo se o payload pedir `published`).
- Moderação: app Android (`mobile/`) ou admin web → **Aprovar** (publica) / **Rejeitar** (apaga).
- Push (rascunho): `POST /api/blog/notify-draft` ao criar rascunho (API ou admin).
- Push (visita única): `POST /api/metrics/notify-visit` após view em detalhe de produto ou leitura de post — só se for o **primeiro** view daquele `visitor_id` naquele item.

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

## Visitantes online (KPI no app)

1. Rode [`supabase-site-presence.sql`](../supabase-site-presence.sql) no SQL Editor.
2. O site envia heartbeat via `POST /api/metrics/presence` (`js/presence.js`) a cada ~45s com a aba visível.
3. O app conta linhas em `site_presence` com `last_seen_at` nos últimos **2 minutos**.

## Push de visitante único (produto / post)

Após um `view` em `product_events` ou `blog_post_events`, o site chama `/api/metrics/notify-visit`.
O servidor só envia FCM se existir **exatamente 1** view para `(visitor_id, produto|post)` e o evento for recente (&lt; 5 min).
Listagens e revisitas do mesmo visitante **não** disparam push.
