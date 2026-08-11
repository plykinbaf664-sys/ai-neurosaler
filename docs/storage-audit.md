# Storage dependency audit

Date: 2026-08-11

## Result

The runtime is disconnected from Supabase. All former database calls now terminate in `lib/data-store.ts`; no route imports the old REST adapter and no Supabase environment variable is required.

The read-only migration attempt against the legacy project failed because its Supabase hostname did not resolve. Consequently, the repository contains a safe demonstration knowledge seed rather than an unverified copy of the former production profile or lead history.

The following behavior remains covered by the replacement layer:

| Domain data | Reads | Writes | Consumer |
| --- | --- | --- | --- |
| Active expert profile | active profile | seed/config edit | webhook, AI prompt, test route |
| Offers | active ordered list | seed/config edit | AI prompt and knowledge replies |
| FAQ | active sorted list | seed/config edit | AI prompt and knowledge replies |
| Objections | active sorted list | seed/config edit | AI prompt and knowledge replies |
| Leads | by Telegram ID, by internal ID, due follow-ups | create and partial update | webhook, gift redirect, cron |
| Messages | recent history by lead | append | quiz, AI context, follow-ups |
| Lead materials | count by lead | create and update analysis/status | PDF, URL and text analysis |

## Previous coupling

The old `lib/supabase-rest.ts` module performed direct PostgREST requests with the service-role key. Four API routes and two prompt/analysis modules imported its functions or database-shaped types. This meant every `/start`, quiz answer, AI reply, gift click and follow-up depended on network access to one Supabase project.

There was no Supabase Auth, client-side SDK, realtime subscription, storage bucket or browser-side Supabase dependency. Replacing the single server adapter therefore removes the complete runtime dependency.

## Replacement

`lib/data-store.ts` preserves the former function contract while using a typed local document:

```text
data/local-db.seed.json       committed initial knowledge
.data/neurosaler.json         ignored mutable working data
lib/data-store.ts             queries, mutations and serialized writes
```

Writes are queued within the Node.js process so simultaneous bot operations do not overwrite each other. New IDs use UUIDs and timestamps remain ISO UTC strings, keeping the existing webhook and prompt logic unchanged.

## Runtime modes

| Mode | Persistence | Intended use |
| --- | --- | --- |
| `file` | Across restarts on one persistent disk | local demo, VPS, Docker volume, ordinary Node host |
| `memory` | Until process restart | short smoke demo, read-only/serverless filesystem |

The automatic default is `file` outside Vercel and `memory` on Vercel. A JSON file is deliberately a demonstration backend, not a horizontally scalable production database.

## Remaining external dependencies

These are independent of Supabase and remain part of the product flow:

- Telegram Bot API for receiving/sending messages and downloading uploaded documents;
- Anthropic Messages API for open-ended replies and material analysis;
- an HTTPS public URL for Telegram webhook delivery;
- a cron caller and `CRON_SECRET` for legacy gift follow-ups;
- the external calendar and gift URLs configured for the expert.

The first three quiz questions and their verdict are deterministic and do not call the AI API. The open dialogue and material analysis do.

## Known limitations

- File mode assumes one application process and a persistent writable disk.
- Memory mode can lose state at restart and cannot guarantee that separate serverless instances share a conversation.
- Whole-document JSON writes are appropriate for a demo-sized dataset, not for large lead volumes.
- The committed seed contains safe demonstration content. Replace it with the exact production expert knowledge and set `NEIRO_GIFT_URL` before a client-facing presentation.
- Historical SQL migrations remain in `supabase/sql` only for reference and are outside the runtime dependency graph.

## Verification checklist

- `rg` finds no Supabase imports or environment reads under `app` and `lib` (mentions in AI forbidden-word rules are plain prompt text only).
- `/api/status` loads the active expert and reports local entity counters.
- TypeScript, ESLint and the Next.js production build pass.
- A manual Telegram smoke test validates the external bot token/webhook, which cannot be proven by an offline build alone.
