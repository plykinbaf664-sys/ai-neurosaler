# Verification Guide — Neiroclozer / ai-neurosaler

## Goal

Verification should prove that the changed behavior works in the real product flow it affects.

Do not claim a change is correct because the code looks correct.
Do not invent commands. Read the actual project scripts/configuration first.
Start with the narrowest meaningful check and widen based on risk.

## Baseline checks

For code changes, discover and use the repository's actual commands for:

- tests;
- type checking;
- linting;
- Next.js build.

The current project context states that local tests and build have passed for the current implementation, but every new change must be verified against the updated working tree.

## Level 1 — Focused logic

Use for:

- quiz logic;
- audit parsing/storage logic;
- progress calculation;
- reward idempotency;
- 24h cooldown logic;
- material count;
- provider normalization;
- storage mapping.

Evidence may be:

- targeted test;
- direct function test;
- type check;
- focused module check.

## Level 2 — Module/integration boundary

Use when crossing:

- webhook → scenario logic;
- scenario → storage;
- library → storage;
- Mini App API → `initData` validation;
- common AI module → provider adapter;
- cron → reminder selection/send;
- admin → storage/export.

## Level 3 — User flow reproduction

Use a safe/test user where possible.

## Marketing quiz verification

Verify:

1. quiz entry works;
2. existing stages remain intact;
3. answers advance as intended;
4. malformed/unexpected input does not corrupt state;
5. qualification result persists;
6. preliminary analysis receives the required context;
7. transfer/request for Alexander is preserved correctly.

If the quiz uses AI for analysis, separately verify deterministic stage state and AI-generated content.

## Free AI dialogue verification

Verify:

1. inbound Telegram message is received;
2. the correct lead/user is loaded;
3. recent context is assembled;
4. storage remains bounded according to current retention logic;
5. configured provider is called correctly;
6. provider failure does not corrupt user stage;
7. outbound response is sent.

Do not call Qwen integration "verified" until a real request succeeds with configured credentials.

## Audit verification

Verify:

1. audit flow can be entered;
2. user can formulate the task in their own words;
3. request is stored in CRM;
4. request belongs to the correct lead;
5. calendar link is sent;
6. no confirmed-booking state is created solely from sending the link.

This final invariant is mandatory regression coverage for audit changes.

## Library verification

Verify:

1. library loads current materials;
2. `AI для жизни` / `AI для бизнеса` paths use current data;
3. Telegraph URL is read from `library_materials`;
4. material total is dynamic;
5. first completion changes progress as intended;
6. repeated completion does not duplicate progress/reward;
7. AI recommendation alone does not mark completion;
8. reward is issued only according to deterministic product conditions.

## Mini App verification

Verify:

1. Mini App renders expected journey data;
2. valid Telegram `initData` is accepted;
3. invalid/tampered `initData` is rejected;
4. identity cannot be replaced by arbitrary client input;
5. achievements are not duplicated;
6. active-day logic remains correct;
7. reminder settings persist and reload correctly.

Changes to `initData` validation are high risk and should include negative-path tests.

## Prediction ball verification

Verify:

1. eligible user can use the feature;
2. result uses local random logic;
3. second use within 24h is handled according to product behavior;
4. use after the cooldown works;
5. share action works if affected;
6. no library/learning progress changes;
7. no educational reward is issued from prediction-ball use.

## Reminder / cron verification

Verify:

1. cron endpoint/job is authenticated according to current implementation;
2. only users with eligible reminder settings are selected;
3. current state is re-checked before send where relevant;
4. duplicate cron execution does not create unwanted duplicate sends;
5. send result/state is stored as intended;
6. deployment scheduling is actually enabled before calling reminders live.

Code existence is not proof that production cron is configured.

## Telegram admin verification

For affected features verify:

- admin authorization/access remains intact;
- analytics queries are correct;
- lead list/details load;
- conversations load from intended bounded history;
- CSV output is structurally valid;
- settings update only the intended values.

## Storage-interface verification

When changing `lib/storage/`:

1. inspect the interface;
2. inspect Supabase adapter;
3. inspect local adapter;
4. update all affected call sites;
5. verify semantic parity for changed operations.

Do not let the local adapter silently behave differently from Supabase for business-critical operations unless the difference is explicit.

## Migration verification

For Supabase migration changes:

1. inspect sequential migrations;
2. confirm migration number/order;
3. check compatibility with existing data;
4. test against a safe database where available;
5. confirm application code works with the migration state expected by rollout.

Current project context states migration `014` still needs to be applied for new functionality.
Verify whether that is still true before applying anything.

Do not edit migration history blindly.

## AI provider verification

Current intended provider setup:

- Qwen primary;
- Anthropic alternative.

For provider changes verify:

- provider selection/config;
- request construction;
- normalized response;
- timeout/error path;
- no product state corruption on provider failure.

Latest local live checks passed with `qwen3.8-max`: `npm run ai:check -- --live` verified JSON output,
and `node --env-file=.env.local scripts/check-dialogue.mjs --live` verified two distinct contextual
replies and catalogue material recommendations. These checks made three real model calls using
synthetic data, without Telegram sends or production CRM writes. Deployed runtime remains unverified.
Tests/mocks can verify integration shape, but they do not prove live provider connectivity.

## Risk guidance

Treat these as higher risk:

- Telegram identity / Mini App `initData`;
- Supabase migrations;
- user stage transitions;
- audit request persistence;
- booking-state semantics;
- completion/reward idempotency;
- reminder sends;
- admin access;
- storage-interface changes;
- provider cutover.

Treat pure copy/UI wording as lower risk unless the text controls flow logic.

## Self-correction loop

When a check fails:

1. read the actual failure;
2. inspect relevant code/state;
3. form the smallest evidence-based hypothesis;
4. fix the cause;
5. rerun the failed check;
6. widen verification if adjacent behavior was affected.

Do not repeatedly make speculative edits without new evidence.

## Final verification report

Report only what was actually verified.

Good:

- tests passed;
- build passed;
- repeated material completion produced one reward;
- tampered `initData` was rejected;
- audit request saved but no booking-confirmed state was written;
- real Qwen request succeeded.

Bad:

- "should work";
- "Qwen is connected" when only mocked tests passed;
- "reminders are live" when cron was not deployed/enabled.

If something remains unverified, state it explicitly.
