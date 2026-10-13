# Agent Work Style — Neiroclozer / ai-neurosaler

## Purpose

These are preferred engineering behaviors for this project.
They guide judgment without prescribing one rigid implementation style.

## Start from the affected user flow

For non-trivial tasks, identify:

- which scenario owns the interaction;
- entry point;
- relevant current stage/state;
- storage operations;
- AI involvement, if any;
- external side effects;
- expected user-visible outcome.

Then inspect only the code needed to understand that path.

## Prefer progressive context discovery

Do not scan the entire repository before every task.

Start from:

- the explicit path/module named in the task;
- `SYSTEM_MAP.md`;
- direct call sites;
- relevant tests.

Expand outward only when needed.

## Extend before duplicating

The project already has dedicated modules:

- `lib/neiroclozer/`
- `lib/library/`
- `lib/storage/`
- Telegram integration modules
- Mini App modules

Prefer extending the existing owner of a behavior.
Do not create a new parallel service/helper/module merely because it is convenient unless the existing boundary genuinely cannot support the change.

## Preserve existing user stages

Stage/state changes can affect multiple flows.

Before changing them:

1. search all reads/writes;
2. inspect storage representation;
3. inspect Telegram routing;
4. inspect Mini App/library dependencies if relevant;
5. verify adjacent flows.

Do not rename or collapse states for aesthetics.

## Keep deterministic state out of prompts

AI can reason and generate.
AI should not be the authoritative mechanism for:

- material completion;
- reward issuance;
- booking confirmation;
- cooldown enforcement;
- stored audit state;
- identity validation.

If a product fact can be represented deterministically, prefer code/storage.

## Provider changes

When working on AI providers:

- use the common AI module;
- localize vendor-specific behavior;
- preserve normalized output expected by product logic;
- handle provider failure without corrupting state;
- distinguish mocked verification from live connectivity.

Do not claim Qwen works in production until a real request has been verified.

## Storage changes

When adding a storage operation:

1. inspect the shared interface;
2. inspect Supabase adapter;
3. inspect local adapter;
4. preserve semantics across both where appropriate;
5. avoid direct Supabase access from unrelated modules if the operation belongs in storage abstraction.

Do not expand retention without an explicit product reason.

## Database migrations

Use sequential migrations in `supabase/sql/`.

Before adding/changing schema:

- inspect existing migration history;
- inspect current code assumptions;
- consider existing rows;
- prefer additive safe changes;
- plan rollout order.

Avoid rewriting already-applied migration history unless the project explicitly calls for it.

## Library/progress changes

Always consider:

- dynamic material count;
- idempotent completion;
- idempotent rewards;
- recommendations vs factual completion;
- both `AI для жизни` and `AI для бизнеса`;
- Mini App route/progress output.

## Audit changes

Always preserve:

```text
calendar link sent ≠ confirmed booking
```

If actual booking confirmation is needed, it requires a new authoritative signal/integration.

## Mini App changes

For identity-sensitive APIs:

- validate Telegram `initData`;
- do not trust arbitrary client user IDs;
- inspect both UI and API behavior;
- verify negative authentication paths.

## Prediction ball changes

Keep the feature:

- local-random based;
- limited to once per 24 hours;
- shareable where implemented;
- independent from learning progress/rewards.

## Reminder changes

Inspect:

- user setting;
- eligibility;
- current cron implementation;
- duplicate-send protection;
- deployment scheduling.

Do not assume the deployed cron is enabled from code alone.

## Verification-first workflow

After meaningful changes:

1. run the narrowest useful verification;
2. inspect real failures;
3. self-correct;
4. widen checks according to risk.

For important product-state changes, verify the end-to-end flow with a safe/test user or isolated environment where practical.

## Repeated mistakes

If the same class of error recurs, ask whether the better fix is:

- clearer context;
- clearer module ownership;
- a test;
- a schema constraint;
- an idempotency rule;
- a runtime guard;
- stronger typing;
- CI/static validation.

Do not solve every repeated failure by making `AGENTS.md` longer.

## Refactoring

Refactor when it directly supports correctness, testability, maintainability or the requested feature.
Do not refactor unrelated working code simply because another structure looks cleaner.
For large refactors, use an ExecPlan.

## Final report

State:

- what behavior changed;
- which modules changed;
- what was actually verified;
- what remains unverified;
- migration/deployment steps if relevant.

Never report a provider, cron, deployment or live integration as verified unless it was actually exercised.
