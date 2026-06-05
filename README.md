# REDFOX — Painel Cal.com / WhatsApp

Painel admin (`calcom-bot`) para intake de perfis, gestão Supabase, instâncias UazAPI e webhooks n8n.

## Local

```powershell
cd calcom-bot
npm install
# .env na pasta pai (rafael/.env) — veja .env.example
.\run.ps1 intake
```

Abre em http://localhost:3781/

## Vercel

1. Importe o repositório no [Vercel](https://vercel.com) com **Root Directory** = `calcom-bot`.
2. Em **Environment Variables**, configure as variáveis de `.env.example`.
3. Deploy.

O robô Cal.com (Playwright) **não roda na Vercel** — use localmente com `npm run create`.

## GitHub

Repositório: https://github.com/rafael-rangel/rafael
