# ExecPlans — Neiroclozer / ai-neurosaler

## Purpose

Use an ExecPlan when a task spans enough modules, state transitions, integrations or rollout steps that sequencing and verification matter.
Do not create plans for small local edits.

## Use an ExecPlan for

Examples:

- new or materially changed Telegram scenario;
- quiz-stage/state redesign;
- audit/booking-state redesign;
- Supabase schema migration;
- storage-interface changes;
- Qwen/Anthropic provider migration;
- Mini App authentication changes;
- library route/progress/reward redesign;
- reminder/cron redesign;
- admin analytics/export redesign;
- cross-module refactor;
- production rollout with migration + environment + deploy dependencies.

## Plan location

Store active plans under:

```text
.agent/plans/
```

Use descriptive names, for example:

```text
.agent/plans/qwen-rollout.md
.agent/plans/library-rewards-v2.md
.agent/plans/audit-calendar-integration.md
```

## ExecPlan template

# [Plan title]

## Goal

Describe the observable product outcome.
Prefer user/business behavior over implementation detail.

## Current behavior

Document the current behavior from code/config/runtime evidence.

Include:

- owning flow;
- current stage/state;
- relevant modules;
- storage operations;
- AI provider involvement;
- external side effects;
- current verification status.

Do not copy stale assumptions from documentation without checking the repository.

## Scope

### In

- ...

### Out

- ...

## Relevant system map

Trace the exact current path.

Example:

```text
Telegram update
→ webhook
→ Neiroclozer scenario
→ storage
→ AI provider
→ Telegram response
```

or:

```text
Mini App
→ journey API
→ initData validation
→ library/profile state
→ response
```

## Invariants to preserve

List only the invariants relevant to this task.

Possible examples:

- existing user stages continue to work;
- calendar link is not confirmed booking;
- AI recommendations do not set factual completion;
- repeated completion does not duplicate rewards;
- material count remains dynamic;
- prediction ball remains independent from learning progress;
- signed `initData` remains required for identity-sensitive Mini App operations.

## Proposed approach

Describe the smallest coherent implementation sequence.

Typical order:

1. inspect current implementation;
2. data/schema preparation if needed;
3. domain/scenario logic;
4. storage/interface changes;
5. transport/UI integration;
6. verification;
7. rollout.

Do not turn the plan into line-by-line coding instructions.

## Data / migration impact

If storage/schema changes, document:

- migration number/order;
- tables/columns/data affected;
- existing-row compatibility;
- defaults/backfill;
- adapter changes;
- rollout dependency.

If no schema change is needed, state that explicitly.

## AI provider impact

If AI behavior/provider changes, document:

- shared interface changes;
- provider-specific configuration;
- prompt/context changes;
- normalized result expectations;
- fallback behavior if any;
- mocked vs live verification.

Do not call live provider integration verified until a real request succeeds.

## External side effects

List any relevant side effects:

- Telegram message;
- CRM write;
- audit request;
- reminder send;
- reward issuance;
- CSV export;
- calendar link;
- provider request.

For repeatable triggers, define how duplicate effects are prevented or detected.

## Verification matrix

| Outcome | Evidence |
|---|---|
| `[user-visible behavior]` | `[focused/integration/E2E check]` |
| `[state invariant]` | `[test/assertion]` |
| `[integration]` | `[safe live or mocked evidence]` |

## Rollout

Only include steps supported by the current environment.

Possible categories:

- Supabase migration;
- environment variables;
- Qwen credentials;
- Vercel deployment;
- Telegram webhook check;
- cron/reminder enablement;
- post-deploy smoke test.

Current context previously listed:

1. migration `014`;
2. Qwen setup;
3. deploy;
4. reminder enablement.

Before executing any of these, verify whether they are still pending.

## Risks / unknowns

List genuine unknowns.
Resolve them through repository inspection, migration inspection, configuration inspection, safe local/integration tests or a safe live-provider test where necessary.
Do not resolve uncertainty by guessing.

## Progress

- [ ] inspect current behavior
- [ ] confirm scope/invariants
- [ ] implement core change
- [ ] verify focused behavior
- [ ] verify adjacent flows
- [ ] complete rollout steps if required
- [ ] update durable documentation if the system model changed

## Result

At completion record:

- what changed;
- what was verified;
- rollout/migration performed;
- what remains unverified;
- known limitations;
- follow-up work.

## Planning principle

The plan is a living execution artifact.
If implementation or runtime evidence invalidates the initial approach, update the plan and continue from the evidence instead of forcing the original design.
