# AI Neurosaler / Neiroclozer

Standalone Next.js project for Neiroclozer, a Telegram-first AI sales assistant.

The project was extracted from the larger AI Launch System app into a separate deployable application. It keeps the existing production logic: Telegram webhook, Supabase storage, prompt builder, AI reply flow, lead status logic, quiz entry flow, gift fallback flow, and gift follow-ups.

## What Was Moved

Runtime routes:

```text
app/api/telegram/webhook/route.ts
app/api/gift/[leadId]/route.ts
app/api/cron/gift-followups/route.ts
app/api/test/route.ts
```

Shared logic:

```text
lib/telegram.ts
lib/supabase-rest.ts
lib/neiroclozer/generate-reply.ts
lib/neiroclozer/prompt-builder.ts
lib/neiroclozer/marketing-roi-quiz.ts
```

Database migrations:

```text
supabase/sql/001_neiroclozer_v0_1.sql
supabase/sql/002_expert_memory.sql
supabase/sql/003_leads_enrichment.sql
supabase/sql/004_gift_followup_tracking.sql
supabase/sql/005_messages_message_type_expand.sql
```

Deployment config:

```text
vercel.json
.env.example
```

## Main Flow

Telegram sends updates to:

```text
/api/telegram/webhook
```

The webhook:

1. verifies Telegram secret token when configured;
2. parses private text messages and inline button callbacks;
3. loads or creates a lead in Supabase;
4. starts the default entry flow;
5. stores incoming/outgoing messages;
6. uses deterministic quiz logic during quiz stages;
7. uses the prompt builder and AI reply flow after qualification.

## Entry Flow Toggle

The entry flow is controlled by:

```env
NEIRO_ENTRY_FLOW_MODE=quiz
```

Supported modes:

```text
quiz  default marketing ROI quiz
gift  legacy gift flow
```

If `NEIRO_ENTRY_FLOW_MODE` is missing or not equal to `gift`, the bot uses the quiz flow by default.

## Quiz Flow

Default flow: marketing ROI quiz.

Stages:

```text
marketing_roi_quiz_q1
marketing_roi_quiz_q2
marketing_roi_quiz_q3
marketing_roi_quiz_completed
```

The quiz has 3 questions with inline Telegram buttons. Answers are scored as:

```text
A = 0
B = 1
C = 2
D = 3
```

After the third answer, the bot sends a verdict and sets:

```text
matched_offer = diagnostic
current_stage = marketing_roi_quiz_completed
```

## Gift Flow

The old gift flow is preserved and can be enabled with:

```env
NEIRO_ENTRY_FLOW_MODE=gift
```

Gift-related routes:

```text
/api/gift/[leadId]
/api/cron/gift-followups
```

The gift redirect route tracks gift link clicks and redirects to the configured gift URL. The cron route sends scheduled gift follow-ups.

## Supabase Tables

The app expects these Supabase tables:

```text
expert_profile
expert_offers
expert_faq
expert_objections
leads
messages
```

Important `messages.message_type` values:

```text
user
welcome
gift
qual_question
gift_followup
ai_reply
```

## Environment Variables

Use `.env.local` locally and Vercel Environment Variables in production.

Required:

```env
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
TELEGRAM_BOT_TOKEN=
TELEGRAM_WEBHOOK_SECRET=
ANTHROPIC_API_KEY=
CRON_SECRET=
```

Recommended:

```env
TELEGRAM_WEBHOOK_BASE_URL=https://ai-neurosaler.vercel.app
PUBLIC_BASE_URL=https://ai-neurosaler.vercel.app
NEXT_PUBLIC_APP_URL=https://ai-neurosaler.vercel.app
ANTHROPIC_MODEL=
CALENDAR_LINK=
NEIRO_ENTRY_FLOW_MODE=quiz
```

Do not commit real secrets. `.env.example` is only a template.

## Telegram Webhook

Production webhook URL:

```text
https://ai-neurosaler.vercel.app/api/telegram/webhook
```

The webhook must allow both text messages and inline button callbacks:

```json
["message", "callback_query"]
```

After changing Vercel env variables, redeploy the project before testing Telegram again.

## Local Checks

Run:

```bash
npm run lint
npx tsc --noEmit
npm run build
```

Expected API routes in the production build:

```text
/api/telegram/webhook
/api/gift/[leadId]
/api/cron/gift-followups
/api/test
```

## Manual Smoke Test

1. Deploy the project to Vercel.
2. Confirm all env variables are present in Vercel.
3. Set Telegram webhook to the deployed `/api/telegram/webhook` URL.
4. Send `/start` to the bot.
5. Confirm the welcome message and quiz question appear.
6. Press an inline answer button.
7. Confirm the next question appears.
8. Complete all 3 questions and confirm the verdict appears.

## Current Production Notes

- The project can reuse the existing Supabase database.
- Telegram webhook is currently intended to point to this standalone project, not the old monolith.
- The AI reply implementation currently uses Anthropic via `ANTHROPIC_API_KEY`.
- `SUPABASE_SERVICE_ROLE_KEY` is required because the API routes use server-side Supabase REST access.
