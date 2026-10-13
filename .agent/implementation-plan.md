# Dialogue, audit intake, journey and rewards

Approved by user; CRM is existing Supabase. Preserve local adapter parity and existing bot flows.

1. Repair URL rendering and conversation fallbacks; keep quiz and handoff state.
2. Capture free-form audit request durably on the existing lead, then send configured calendar.
3. Use existing AI provider and active library catalogue to suggest a validated personal track.
4. Extend existing profiles with a compact journey/activity snapshot; use existing events for awards.
5. Add authenticated Telegram Mini App for track, progress and awards; existing host and database.
6. Extend existing reminders with next-step recommendations, opt-out and concurrency protection.
7. Verify with mocked Telegram/AI integration tests, auth tests, lint, typecheck and production build.

No deployment or production data writes performed by this implementation plan. Migration and deployment requirements will be reported explicitly.

Implemented: intake, conversational routing, catalogue-validated track, authenticated Mini App,
compact daily activity, atomic rewards/completion and claimed next-step reminders. The gift-link
callback also preserves later stages. No production schema or deployment was changed.

Verified: full Node suite, lint, production build; eight real public destinations from Supabase
responded HTTP 200. All migrations and repeatability/atomic claims were executed in isolated
PostgreSQL/WASM. Browser smoke test passed at 320 and 390 px with synthetic data and Telegram SDK.
Live Telegram clients and production cron deliveries remain deployment smoke checks.
Screenshots are in `.agent/artifacts/`.

The live Anthropic smoke check returned HTTP 400 / insufficient credits on the configured
account. Real response quality cannot be checked until its balance is replenished. Provider
failures are handled in dialogue, audit intake and material analysis without webhook retries;
saved requests, materials and tracks are retained. Regression coverage includes these failures.
Lint and production build passed after the failure handling changes; 31 test cases passed
(30 in the full suite, plus the subsequently added outage regression in the 12-case targeted suite).

Launch prerequisites: apply migration 014, deploy, configure the chosen AI provider, and explicitly
enable LIBRARY_FOLLOWUPS_ENABLED with CRON_SECRET for scheduled reminders. No production
migration, deployment, credit purchase or real Telegram message was performed.

Repository notes: documentation paths mentioned by AGENTS.md currently do not exist. Existing uncommitted storage optimizations and user documentation changes are preserved.

## Qwen follow-up (requested by user)

Use one provider switch in the existing generation boundary, preserving prompts, limits and
all bot/database flows. Configure AI_PROVIDER, QWEN_API_KEY, QWEN_BASE_URL, QWEN_MODEL.
The base URL is explicit because Model Studio keys/endpoints are regional and workspace-specific.
Update runtime readiness, env template, local fields and a short Russian setup guide. Add a
config-only / opt-in live CLI check. Verify request/response/error contracts for both providers,
then run the conversation/audit/track regressions with Qwen mocks, lint and production build.
No Qwen credential has been supplied; a real provider call remains a post-configuration check.
Implemented and verified: 39 tests in the full suite, 12 conversation/audit/journey cases
additionally run with Qwen mocks, ESLint and production build all passed. Config-only CLI
correctly reports the missing QWEN_API_KEY. Local provider is set to qwen; existing secrets
are retained. No live AI calls, database writes or deployment occurred in this follow-up.
