# Papelê Moderação (Android / Capacitor)

App leve para revisar rascunhos do blog, aprovar/rejeitar, e postar no Facebook.

## Pré-requisitos

- Node.js 20+
- JDK 21+ (o script usa o JBR do Android Studio se existir)
- Android SDK (`ANDROID_HOME` ou `%LOCALAPPDATA%\Android\Sdk`)
- Conta admin no Supabase (mesmo login do `/admin`)
- SQL [`../supabase-blog-push.sql`](../supabase-blog-push.sql) aplicado
- (Push) Firebase Android app + `android/app/google-services.json` + secrets FCM na Vercel

## Setup

```powershell
cd mobile
npm install
npx cap add android   # só na primeira vez
npm run build:apk
```

O APK sai em:

- `../dist/apk/papele-educa-moderation-v1.0.N.apk`
- `../dist/apk/papele-educa-moderation-latest.apk`

Cada `build:apk` incrementa `versionCode` / `versionName` e assina com o keystore do projeto — instale por cima no aparelho, sem desinstalar.

## Firebase / Push

1. Crie um app Android no Firebase com package `br.com.papeleeduca.moderation`.
2. Baixe `google-services.json` para `android/app/google-services.json`.
3. Gere uma service account com Firebase Cloud Messaging API e configure na Vercel:
   - `FCM_PROJECT_ID`
   - `FCM_SERVICE_ACCOUNT_JSON`
4. Webhook Supabase `blog_posts` INSERT → `POST /api/blog/notify-draft` (ver [`../docs/blog-automation-moderation.md`](../docs/blog-automation-moderation.md)).

Sem Firebase o app funciona (lista/aprovar/rejeitar/Facebook). O push fica **desligado** em `www/config.js` (`ENABLE_PUSH = false`) — ativar só depois do `google-services.json`, senão o Android fecha o app ao registrar FCM.

## Keystore

Arquivo: `android/keystore/moderation.jks`  
Propriedades: `android/keystore.properties`  
**Não troque** o keystore entre builds — senão o Android exige desinstalar.
