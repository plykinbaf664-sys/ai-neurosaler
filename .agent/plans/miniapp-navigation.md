# Mini App opening and permanent menu

## Goal
Reproduce the reported Mini App error and fix its cause without weakening Telegram identity validation.
Keep main-menu access available independently of old messages and active audit/quiz stages.

## Evidence and scope
Production serves the updated UI and migration 015 fields. The previous smoke check only verified
unsigned rejection and a UI with mocked Telegram SDK/API; it did not prove the real launch path.
Telegram's native command menu is present but getMyCommands returns an empty list.
Inspect SDK bootstrap, signed initData, profile reads and award/activity RPCs before choosing a fix.
Use existing webhook/library navigation; no new tables or account system.

## Verification and safety
Read production data only. A signed synthetic Mini App user must be confirmed absent before a production
API probe, so the API exits before activity/reward writes. Do not send real Telegram messages as tests.
Compare persistent reply keyboard vs native command-menu behavior using Telegram's official docs.
Preserve inline action buttons, start payloads, pending audit cancellation semantics and signed auth.
Verify real SDK launch in headless browser, auth negative paths, relevant regressions, lint and build.

## Progress
- [x] Inspect current code, deployed fields and native menu configuration.
- [x] Identify reported Mini App failure and patch public URL resolution; deployment remains required.
- [x] Implement permanent navigation and verify protected flows.
- [x] Record test evidence and deployment requirements; phone verification remains pending deployment.

## Findings and delivered navigation
Production `getMyCommands` was empty. Configured native command menu for private chats (default/Russian)
with `/start` labelled "🏠 Главное меню", retaining other configured commands. Telegram readback confirms
the setting and menu button type `commands`. This is live, sends no chat messages and needs no deploy.
Chosen over a persistent reply keyboard: it remains beside the input without replacing inline action
keyboards or sending an additional keyboard-installation message.
Reproducible setup: `node --env-file=.env.local scripts/configure-telegram-menu.mjs --apply`.
Added `/menu` alias to the existing library entry point and excluded it from pending audit text intake.
The alias is a local code change requiring deployment; the live native button uses existing `/start`.

## Initial Mini App diagnosis (before user supplied the error)
- Real Telegram SDK in headless Chrome with signed synthetic initData reaches production journey API.
  Confirmed synthetic Telegram ID absent in CRM first; API returns expected 404/start guidance before
  activity or award writes. This verifies deployed signature validation beyond unsigned rejection.
- Direct browser entry without initData correctly asks the user to open from the bot.
- Existing user's material/profile/reward reads and dashboard construction succeed (6 materials, 4 read).
  Diagnostic fetch wrapper blocked production writes and intercepted award RPCs; this does not prove
  the activity/award mutation part of real Mini App loading.
- RPC signatures for activity and awards are present in the live schema.
- The reported error is not yet reproduced. Asked user for exact text and launch path; do not declare
  the Mini App fixed or change authentication on an unverified hypothesis.

## Verification
19 dialogue tests pass, including menu exit from pending audit without CRM request/progress corruption.
Adjacent prediction-ball/library tests passed in the initial run; its new menu test exposed the audit
interception, which was fixed and rerun successfully. Lint and production build passed; diff check clean.

## Confirmed user symptom and URL fix (2026-10-15)
User reports ERR_NGROK_3200 on phone after pressing route/rewards. This is an offline ngrok endpoint
before the application loads, not evidence of a Telegram signature or database failure.
Current local public URLs and live webhook point to ai-neurosaler.vercel.app; live /journey returns 200
with no redirect. The erroneous URL is embedded in an old button or came from deployed configuration;
the exact old button URL is unavailable through Bot API history.
Previously `getPublicBaseUrl` preferred webhook configuration over the public app URL. Public app URLs
now take priority, followed by stable Vercel production domain and current request, with legacy webhook
fallback for scripts. Production rejects ngrok/localhost and HTTP; local tunnels remain supported.
`/api/status` now exposes the resolved public `library.miniAppUrl` for deployment verification without
creating user activity or granting awards. Auth and database logic remain unchanged.
Rollout: deploy code, check the resolved URL, then user invokes /start to obtain a fresh inline button.
Old Telegram buttons cannot be changed by deploying a new frontend. No migration or new secrets needed.

Final local verification: all 53 tests passed, including URL resolution and a production /start button
with stale ngrok settings. ESLint and the production build passed; git diff whitespace check is clean.
Production deployment and a fresh phone launch remain to be verified after rollout.

## Follow-up: audit all current public links (2026-10-15 Moscow)
- Read-only live checks passed: all 6 active Telegraph materials from Supabase, calendar (title
  AI-диагностика), Yandex gift, /journey, /library, Telegram SDK, actual bot start=ball and share URL.
  All 13 destinations returned 200 with expected page content/titles; 11 Mini App static assets also
  returned 200. Unsigned /api/library/open and /api/library/next returned expected 401.
- Telegram webhook points to the permanent Vercel domain, with zero pending updates and no last error.
  Deployed /api/status still lacks library.miniAppUrl: the previous URL fix is not confirmed deployed.
- Extended the existing check-public-links script to cover app/Telegram destinations and fail on
  broken/unverified checks. Added isolated tests for all material URLs generated by Telegram and the
  Mini App, next redirects, no token leakage to Telegraph, no implicit completion, and expired tokens.
  All 40 targeted tests and ESLint passed. No application code changed in this follow-up, so the
  previous production build result remains applicable. No production tracking/progress/CRM writes.
- Old embedded ngrok URLs in Telegram messages remain stale; rollout still requires deploy + /start.

## Follow-up: repair the owner's existing Telegram menu (2026-10-15 Moscow)
- Commit e064201 is now deployed: live /api/status exposes library.miniAppUrl as
  https://ai-neurosaler.vercel.app/journey; /journey returns 200 without redirect. Webhook uses the
  same permanent origin, queue is empty, global native menu is commands, owner override is default,
  and getMe has_main_web_app is false. Another code/deploy patch is not justified by this evidence.
- The owner's retained history still contains a main-menu message sent before that deployment
  (2026-10-14 22:30 UTC). Confirmed its lead/chat belongs to TELEGRAM_ADMIN_USER_ID and its stored
  outgoing text is the main menu. Replaced only that existing message's reply_markup via Telegram
  editMessageReplyMarkup, preserving the current marketing/category/Mini App buttons.
- Telegram returned the edited message with the permanent /journey web_app URL and unchanged text.
  No new messages sent, no database writes, no progress/reward mutations. This repairs the retained
  menu itself, whereas previous deployment checks only verified generation of future buttons.
- User must close the already-open offline Mini App window and reopen from the repaired latest menu.
  Actual phone launch remains pending confirmation. Other older messages outside retained history
  may still embed old URLs; /start generates the verified permanent address.
