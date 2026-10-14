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
- [ ] Reproduce and repair Mini App opening.
- [x] Implement permanent navigation and verify protected flows.
- [x] Record available test evidence and deployment requirements; Mini App diagnosis remains open.

## Findings and delivered navigation
Production `getMyCommands` was empty. Configured native command menu for private chats (default/Russian)
with `/start` labelled "🏠 Главное меню", retaining other configured commands. Telegram readback confirms
the setting and menu button type `commands`. This is live, sends no chat messages and needs no deploy.
Chosen over a persistent reply keyboard: it remains beside the input without replacing inline action
keyboards or sending an additional keyboard-installation message.
Reproducible setup: `node --env-file=.env.local scripts/configure-telegram-menu.mjs --apply`.
Added `/menu` alias to the existing library entry point and excluded it from pending audit text intake.
The alias is a local code change requiring deployment; the live native button uses existing `/start`.

## Mini App diagnosis so far
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
