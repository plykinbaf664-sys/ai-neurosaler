# AI Neurosaler / NeuroSeller

Telegram-first AI sales assistant on Next.js 16. The application runs without Supabase: expert knowledge, leads, message history, materials and follow-up state are stored by the local data layer in `lib/data-store.ts`.

## Current architecture

```text
Telegram
  -> POST /api/telegram/webhook
  -> quiz / qualification / material analysis / AI reply
  -> lib/data-store.ts
  -> .data/neurosaler.json
```

Runtime routes:

```text
GET  /                         runtime dashboard
GET  /api/status               readiness and local counters
POST /api/telegram/webhook     Telegram updates
GET  /api/gift/[leadId]        tracked gift redirect
GET  /api/cron/gift-followups  scheduled gift follow-ups
GET  /api/test                 AI reply check for an existing lead
```

## Local data

The first local request copies `data/local-db.seed.json` to `.data/neurosaler.json`. All further leads, messages and materials are written to that working file. The `.data` directory is ignored by Git.

Edit `data/local-db.seed.json` before the first run to change the expert profile, offers, FAQ, objections and gift URL. If `.data/neurosaler.json` already exists, edit that working file instead or move it away to initialize a fresh copy from the seed.

Modes:

```env
LOCAL_DATA_MODE=file
```

- `file` is the default outside Vercel and preserves data between restarts.
- `memory` stores data only for the lifetime of the Node.js process.
- when `LOCAL_DATA_MODE` is omitted on Vercel, `memory` is selected automatically because the deployment filesystem is not persistent.

For a reliable live Telegram demonstration, run the app as a normal Node.js process with `LOCAL_DATA_MODE=file` and expose it through an HTTPS tunnel or a server with a persistent disk. Vercel memory mode is suitable only for a short UI/API smoke demo: serverless instances can restart or serve separate copies of state.

## Environment

Copy `.env.example` to `.env.local` and fill in the integrations used by the demo.

Required for the Telegram flow:

```env
TELEGRAM_BOT_TOKEN=
TELEGRAM_WEBHOOK_SECRET=
ANTHROPIC_API_KEY=
CRON_SECRET=
```

Recommended:

```env
TELEGRAM_WEBHOOK_BASE_URL=https://your-public-host.example
PUBLIC_BASE_URL=https://your-public-host.example
NEXT_PUBLIC_APP_URL=https://your-public-host.example
ANTHROPIC_MODEL=
CALENDAR_LINK=
NEIRO_GIFT_URL=
NEIRO_ENTRY_FLOW_MODE=quiz
```

The default entry flow is the three-step marketing ROI quiz. Set `NEIRO_ENTRY_FLOW_MODE=gift` to use the legacy gift flow.

`NEIRO_GIFT_URL` overrides the seed profile's `gift_url` at runtime. Set it before a client-facing demo; the committed seed intentionally contains a placeholder URL.

## Run and verify

```bash
npm run dev
```

Open `http://localhost:3000` for the runtime dashboard and `http://localhost:3000/api/status` for the JSON health check.

Quality checks:

```bash
npm run lint
npx tsc --noEmit
npm run build
```

## Telegram smoke test

1. Start the app with a public HTTPS URL.
2. Point the Telegram webhook to `/api/telegram/webhook` and allow `message` and `callback_query` updates.
3. Send `/start` to the bot.
4. Complete all three inline quiz questions.
5. Send a text, URL or PDF material and verify the analysis and audit handoff.
6. Refresh `/` and confirm that the lead/message/material counters increased.

## Legacy database files

The SQL files under `supabase/sql` are retained only as the historical schema and a migration reference. They are not imported or executed by the application. The runtime has no Supabase URL/key requirement and makes no Supabase network requests.

See `docs/storage-audit.md` for the dependency audit, entity mapping and operational limitations.
