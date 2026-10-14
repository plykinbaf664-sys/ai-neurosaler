# AI Neurosaler / NeuroSeller

Telegram-first AI sales assistant on Next.js 16. Business logic uses one storage interface with interchangeable local and Supabase adapters.

## Implemented changes

- added `lib/storage` with local and Supabase adapters selected through `STORAGE_DRIVER`;
- kept the existing local JSON store and restored lightweight Supabase/PostgREST persistence;
- added a committed demonstration knowledge seed and mutable ignored runtime data;
- preserved Telegram quiz, qualification, gift tracking, follow-ups, AI replies and material analysis;
- added a runtime dashboard and `/api/status` health endpoint;
- added an owner-only Telegram admin panel with statistics, dialogues, CSV lead export and safe runtime settings;
- retained the additive Supabase schema migrations under `supabase/sql`.

## Current architecture

```text
Telegram
  -> POST /api/telegram/webhook
  -> quiz / qualification / material analysis / AI reply
  -> lib/storage/index.ts
  -> local JSON or Supabase Postgres
```

Runtime routes:

```text
GET  /                         runtime dashboard
GET  /api/status               readiness and storage counters
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

## Switching storage

Local is the default:

```env
STORAGE_DRIVER=local
LOCAL_DATA_MODE=file
```

For Supabase, apply the existing additive SQL files from `supabase/sql` in filename order and set server-only credentials:

```env
STORAGE_DRIVER=supabase
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=
```

The Supabase adapter uses explicit column lists, keeps only bounded message history and truncated extracted material text, and never uses Supabase Storage for PDFs or media.

## Ecosystem library

The optional Telegram/web library is isolated behind a feature flag. Apply the Supabase migrations through `supabase/sql/009_library_memory_and_followups.sql`, set a random server-only signing secret of at least 24 characters, then enable it:

```env
LIBRARY_ENABLED=true
LIBRARY_LINK_SECRET=replace-with-a-long-random-secret
```

With `LIBRARY_ENABLED=false` or when the variable is omitted, `/start` follows the existing marketing flow. When enabled, `/start` shows marketing, AI for life and AI for business. Material links contain a short-lived signed token and never expose a Telegram user ID.

Library openings and completions are stored as compact events and progress rows. A bounded profile snapshot keeps only route/category/topic/material context and follow-up timestamps; message history remains capped at 12 entries.

Library follow-ups use a separate cron route and are off by default:

```env
LIBRARY_FOLLOWUPS_ENABLED=true
LIBRARY_FOLLOWUP_DELAY_HOURS=24
LIBRARY_FOLLOWUP_INACTIVITY_HOURS=12
```

The handler sends only due material check-ins, skips recently active users and enforces at most one library follow-up per user per day. Set `LIBRARY_FOLLOWUPS_ENABLED=false` to disable scheduling and sending without affecting gift follow-ups.

## Environment

Copy `.env.example` to `.env.local` and fill in the integrations used by the demo.

Required for the Telegram flow:

```env
TELEGRAM_BOT_TOKEN=
TELEGRAM_ADMIN_USER_ID=
TELEGRAM_WEBHOOK_SECRET=
AI_PROVIDER=qwen
QWEN_API_KEY=
QWEN_BASE_URL=
QWEN_MODEL=qwen-plus
CRON_SECRET=
```

Recommended:

```env
TELEGRAM_WEBHOOK_BASE_URL=https://your-public-host.example
PUBLIC_BASE_URL=https://your-public-host.example
NEXT_PUBLIC_APP_URL=https://your-public-host.example
CALENDAR_LINK=
NEIRO_GIFT_URL=
NEIRO_ENTRY_FLOW_MODE=quiz
```

`PUBLIC_BASE_URL` is the canonical origin for Mini App and tracked links; `NEXT_PUBLIC_APP_URL` is an
alternative. On Vercel production, temporary ngrok/localhost URLs are skipped in favor of the stable
`VERCEL_PROJECT_PRODUCTION_URL` or current request origin. `TELEGRAM_WEBHOOK_BASE_URL` is only a legacy
fallback when no public URL or request is available. Local development may still use ngrok.
After deployment, check `/api/status` → `library.miniAppUrl`, then send `/start` and use the new
"Мой маршрут и награды" button. Old Telegram messages retain their original embedded URLs.

The default entry flow is the three-step marketing ROI quiz. Set `NEIRO_ENTRY_FLOW_MODE=gift` to use the legacy gift flow.

For Qwen, fill in the API key and OpenAI-compatible URL from the same provider region/workspace.
See [Qwen setup (Russian)](docs/qwen-setup.md) for the exact fields, server configuration and checks.
`npm run ai:check` validates settings without a request; `npm run ai:check -- --live` makes one
small API call. All AI flows use the selected provider. Qwen uses non-thinking chat mode and JSON
output for personal tracks; choose a model that supports both (default `qwen-plus`).
Set `AI_PROVIDER=anthropic` plus `ANTHROPIC_API_KEY` / optional `ANTHROPIC_MODEL` to keep Anthropic.
Existing installations without `AI_PROVIDER` retain Anthropic. There is no automatic fallback.

`NEIRO_GIFT_URL` overrides the seed profile's `gift_url` at runtime. Set it before a client-facing demo; the committed seed intentionally contains a placeholder URL.

## Telegram admin

Set your numeric Telegram user ID in `TELEGRAM_ADMIN_USER_ID`, restart the app and send `/admin` to the bot. Admin commands are intercepted before the lead flow, so the owner is not created as a lead. Other Telegram users receive no administrative access.

Available sections:

- **Funnel** — unique people at each marketing and library step, for new-user cohorts of 7/30 days or all time;
- **Clicks** — event counts by section and material, including tracked material and gift links;
- **Database** — live storage driver and record counts;
- **Leads CSV** — a document with Telegram usernames, names, statuses, stages, warmth, offer, message count and timestamps;
- **Dialogues** — recent leads by username with the latest incoming and outgoing messages;
- **Settings** — persistent `quiz/gift` entry-mode switching and gift follow-up enable/disable.

Only whitelisted operational settings can be changed from Telegram; arbitrary environment variables and secrets are never exposed. Local settings are persisted in `.data/neurosaler.json`. With Supabase, apply `supabase/sql/011_runtime_settings.sql` before using the settings buttons; changes are then persisted in `runtime_settings`. If the migration is absent, environment defaults remain active and settings changes fail instead of appearing to succeed.

Click events are counted from the deployment that introduces them. A Telegram bot link opening alone cannot be tracked; the user must press Start. Library material buttons use signed tracked links valid for 30 days.

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

## October library materials and prediction ball

Apply `supabase/sql/012_sales_audit_and_decision_materials.sql` and
`supabase/sql/013_prediction_ball_daily_limit.sql` before deploying the prediction ball.
Migration 012 safely upserts the two Telegraph materials and appends new entries per category;
repeating it preserves IDs and positions. Local storage merges the same materials from the seed.

The life category has a separate `🔮 Шар предсказаний` button. `/start ball` (also
`/start@BotUsername ball`) opens it directly, even when the library flag is disabled.
It does not contribute to library progress or rewards. A successful spin records
`prediction_ball_spun` with `metadata.result` in existing `user_events`; the SQL function
locks the existing lead row while checking the rolling 24-hour limit and recording the spin.
Early attempts show the configured warning as a Telegram alert, preserving the previous result
and its share button. Local storage uses its existing serialized write queue for the same check.
Local memory mode retains its existing non-persistent behavior; production uses Supabase.

Bot username is resolved with Telegram `getMe` and cached. Sharing uses the standard
Telegram share URL with the complete result text and `start=ball` deep link; Telegram clients
may additionally prepend the URL to the text. No AI, assets, tables or frontend are involved.

Run `node --test tests/*.test.mjs` with Node 24 to check materials, progress, duplicate completion,
rewards, ball animation/sharing, concurrent spins, the 24-hour boundary, start routing,
marketing quiz, AI dialogue and handoff. Tests use isolated in-memory data and mocked network calls.

## Telegram smoke test

1. Start the app with a public HTTPS URL.
2. Point the Telegram webhook to `/api/telegram/webhook` and allow `message` and `callback_query` updates.
3. Send `/start` to the bot.
4. Complete all three inline quiz questions.
5. Send a text, URL or PDF material and verify the analysis and audit handoff.
6. Refresh `/` and confirm that the lead/message/material counters increased.

## Supabase schema

The migrations under `supabase/sql` are additive and provide the tables expected by the Supabase adapter. The service-role key is read only by the server-side storage layer.

## Dialogue, audit intake and personal journey

Apply `supabase/sql/014_journey_and_audit.sql` **before deploying this version**. It extends
existing `leads` and `user_library_profiles` and adds server-only RPCs; there are no new tables.
It is repeatable. Existing rows, material URLs, stages and progress are retained.

- `аудит` starts intake from any conversation. The bot asks for a free-form request, stores it in
  `leads.audit_request` / `audit_requested_at`, then sends `CALENDAR_LINK`. Sending a calendar link
  records handoff, not a confirmed booking. The request is visible in the Telegram admin dialogue
  and CSV even after older messages are pruned. No Calendar API booking synchronization is claimed.
- Library dialogue uses the configured Qwen or Anthropic provider and bounded recent history. One call
  returns a conversational reply and up to three validated active material IDs. The compact
  goal/track snapshot is stored in the existing user profile; completion remains a button action.
- `/journey` is the Telegram Mini App launched by the main menu's “Мой маршрут и награды” button.
  Configure the existing public base URL as an HTTPS host. The API checks HMAC-signed Telegram
  initData and its age (one hour); it never trusts a client-provided user ID. No new account is needed.
- Awards reuse `user_events`. Granting an award and material completion are atomic and repeatable.
  Active use counts distinct UTC days using two profile fields, starting when tracking is deployed.
  There are no timers, heartbeat logs or full activity histories; prediction ball spins are not
  material completions. Awards already earned are retained if the catalogue changes.
- Enable `LIBRARY_FOLLOWUPS_ENABLED=true` to activate the existing cron. It sends one next-step
  recommendation after inactivity, then waits for another interaction before scheduling another.
  The default delay is 24 hours, minimum inactivity is 12 hours, and frequency is at most once per
  24 hours. Users can opt out in the Mini App or the message button. A DB claim prevents concurrent
  sends. An uncertain/failed delivery is not immediately retried. Existing Vercel cron runs daily,
  so delivery may be later than the configured threshold. `CRON_SECRET` remains required.

Verification:

```powershell
node --test tests/*.test.mjs
npm.cmd run lint
npm.cmd run build
# Read-only checks of actual public destinations; no tracked user URLs or real bot messages.
node --env-file=.env.local scripts/check-public-links.mjs --live
```

The link check reads active destinations from Supabase, follows redirects and checks page titles,
the Mini App/library pages, Telegram SDK, real bot deep link and share URL. Unsigned library endpoints
must return 401. It exits nonzero on failed/unverified checks; `--base-url https://your-app.example`
overrides the app origin for deployment checks. Signed user links are tested only in isolated storage.

Optional isolated checks use PGlite and Playwright installed outside the project:
`scripts/verify-journey-migration.mjs` accepts `PGLITE_MODULE` (path to its JS entry point), and
`scripts/preview-journey.mjs` accepts `PLAYWRIGHT_MODULE` plus `PREVIEW_URL` (defaults to
`http://localhost:3017/journey`). They use a fresh in-memory DB and synthetic browser data.
The preview writes screenshots to `.agent/artifacts/`.

AI provider failures are logged as a short reason/status/request ID, without the raw provider
response or user prompt. Dialogue responds with a temporary-unavailability notice; audit intake
still accepts and stores the request and sends the calendar. Failed material analysis retains
the submission without marking it analyzed. If logs show `insufficient_credits`, replenish the
configured provider account: application changes alone cannot restore AI replies.
