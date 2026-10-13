# Dynamic library and persistent navigation

## Goal
Connect conversation, a saved personal route, material application and next-step navigation.
Every audit/handoff response must leave a usable return to the menu. Present readable material cards.

## Current behavior and evidence
Live read-only CRM inspection: latest user entered audit, received calendar, then asked for materials
and AI for business. Handoff switched to the sales prompt without catalogue or navigation buttons.
AI falsely implied calendar visibility. Migration 014 and the Qwen deployment are now present.
Recommendations only persist with a nonempty goal; Telegram, Mini App and cron choose next items separately.

## Scope and approach
1. Reuse library recommendation module for shared route selection across Telegram, Mini App and cron.
2. Persist route changes independently of goal changes; preserve routes during smalltalk and AI errors.
3. Add compact material guidance to existing library_materials and bounded feedback to existing profiles.
   Read original articles, seed verified guidance via additive migration and local seed.
4. Add application/alternative/next-step actions; completed, skipped and exhausted states stay explicit.
5. Restore navigation in audit/handoff and route ordinary post-handoff chat through the library context.
6. Format material cards and recommendations using existing Telegram Markdown-to-HTML conversion.
7. Verify regression flows, SQL/local adapter parity, live synthetic Qwen replies, lint and build.

## Invariants
Completion/rewards remain deterministic and idempotent. Feedback is distinct from completion.
AI cannot confirm bookings, claim expert notification or invent catalogue material content.
Existing quiz, audit intake, ball cooldown, signed links and Mini App identity validation remain intact.
No new tables, external services, unlimited histories or frontend application.

## Data and rollout
Migration 015 adds optional compact guidance and feedback columns to existing tables, plus guidance seed.
Both adapters and the local seed retain parity. Apply migration before deploying changed column lists.
Production is read only during implementation. No real user messages, CRM writes, migration or deploy
are performed as tests. Existing public article requests and synthetic AI calls are read/check operations.

## Verification matrix
- Existing-goal recommendations persist; smalltalk/errors preserve route; completed/skipped/inactive excluded.
- Telegram next step, Mini App track and reminders agree; empty/all-completed routes remain navigable.
- Help/skip/applied buttons do not complete materials or grant learning awards.
- Audit calendar and subsequent chat retain menu; handoff catalogue questions use library context.
- Quiz state, pending audit and existing progress/rewards stay protected.
- Material formatting escapes content and keeps tracked links/buttons; SQL migration is repeatable.

## Progress
- [x] Inspect live conversation and current routing.
- [x] Implement shared selection, feedback and material guidance.
- [x] Implement navigation, readable cards and contextual conversation.
- [x] Verify focused/adjacent flows and rollout notes.

## Result and evidence (2026-10-14)
- Shared route selection is used by Telegram, Mini App and reminder delivery. Route updates persist even
  without a changed goal; smalltalk and model errors preserve the route. Feedback is limited to the
  latest 20 material entries and never changes factual completion.
- Formatted cards show when a material helps, its outcome and application steps. Guidance was reviewed
  against all six original Telegraph articles. The review-selection article is about buying a product;
  its old overly broad annotation is corrected conditionally in 015 and in the local seed.
- Handoff chat has catalogue/CRM context and navigation. Audit/calendar replies and final chunks of
  long replies keep main-menu access. AI prompts prohibit unverified calendar/notification claims.
- `node --test tests/*.test.mjs`: 45 passed. Dialogue suite with `TEST_AI_PROVIDER=qwen`: 18 passed.
- Explicit application-help navigation exits pending audit intake, so the following practice message
  cannot accidentally become a CRM audit request. Ordinary intake still uses its existing handler.
- TypeScript, ESLint and production build checked. PostgreSQL/WASM verified all migrations, repeatable
  014/015, seed guidance parity, preservation of editorial changes/feedback and existing atomic RPCs.
- Headless Chrome checked Mini App at 390/320 px, tracked links, awards and reminder switch; no browser
  errors. Updated `.agent/artifacts/journey-track.png` captures the readable material cards.
- Configured live Qwen `qwen3.8-max` answered a two-turn decision dialogue and a synthetic post-calendar
  business dialogue. One earlier request returned malformed JSON; safe fallback preserved state.
  A regression test now covers that case. No automatic retry or provider switching was introduced.

## Rollout and limitations
Apply `supabase/sql/015_dynamic_library.sql` before deploying: changed select lists require its columns.
No additional environment variables are needed. This work did not deploy, change production CRM/schema,
send Telegram messages to users or enable production reminders. Live AI wording remains probabilistic;
validated IDs and deterministic progress/navigation bound its effect. The pending rollout is external
to the completed local patch. Existing context-document routing through `.agent/PLANS.md` is accessible.
