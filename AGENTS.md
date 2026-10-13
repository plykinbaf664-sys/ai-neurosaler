# AGENTS.md

## Purpose

This repository contains **Neiroclozer / ai-neurosaler** — Alexander's Telegram-first AI system for attracting, qualifying, educating and accompanying potential clients.

Treat this file as a **map of the working environment**, not as a rigid rulebook.
Use engineering judgment. Load only the context relevant to the current task.
Do not read every documentation file before every edit.

## Context engineering principle

Use progressive context discovery:

1. Understand the requested outcome.
2. Identify the affected product flow, module or system boundary.
3. Read only the documentation relevant to that area.
4. Inspect the current implementation before making assumptions.
5. Expand context only when the task requires it.
6. Verify the result with executable evidence where practical.

More context is not automatically better context.
Prefer current code, schemas, tests, configuration and runtime evidence over stale prose.

## Documentation routing

Use this documentation as a navigation system:

- Product purpose, users, flows, terminology and business rules:
  → `docs/PROJECT_CONTEXT.md`

- Architecture, module boundaries, integrations and dependency direction:
  → `docs/ARCHITECTURE.md`

- Understanding where an end-to-end feature lives:
  → `docs/SYSTEM_MAP.md`

- Testing and proving a behavioral change:
  → `docs/VERIFICATION.md`

- Non-obvious durable engineering/product decisions:
  → `docs/DECISIONS.md`

- Preferred engineering behavior:
  → `docs/AGENT_WORK_STYLE.md`

- Complex, multi-step, migration, architectural or high-risk work:
  → `.agent/PLANS.md`

`README_CONTEXT_ENGINEERING.md` explains this documentation system primarily for humans and normally does not need to be read during implementation.

## Source of truth

Documentation is for navigation and durable context.
For exact implementation details, inspect the current repository.

Do not assume from documentation alone:

- exact database schema;
- exact enum/stage values;
- exact API signatures;
- exact environment variable names;
- exact provider model identifiers;
- exact test commands;
- exact deployment configuration.

If docs and implementation disagree:

1. inspect code, tests, migrations and configuration;
2. determine whether documentation is stale or implementation is wrong;
3. do not silently guess;
4. update durable documentation only when the actual system model changed.

## Project orientation

Main code areas:

- `app/api/telegram/webhook/route.ts` — incoming Telegram messages, commands and buttons.
- `lib/neiroclozer/` — quiz, audit, material analysis, prompts and AI requests.
- `lib/library/` — library, dialogue, route, progress, rewards and reminders.
- `lib/storage/` — common storage interface and Supabase/local adapters.
- `lib/telegram.ts` — Telegram API integration.
- `lib/telegram-admin.ts` — Telegram admin functionality.
- `app/journey/` — Telegram Mini App UI.
- `app/api/journey/` — Mini App server API.
- `supabase/sql/` — sequential schema/data migrations.

Inspect the repository before relying on these paths if the task concerns moved or renamed code.

## Important product invariants

Preserve these unless the task explicitly changes the product model:

- existing user scenarios and stages must keep working;
- extend existing modules before introducing parallel implementations without a concrete reason;
- the number of library materials is calculated dynamically;
- repeated completions and rewards must not duplicate;
- AI may recommend answers, materials and a route, but does not control factual completion state or booking state;
- sending a calendar link is not the same as a confirmed booking;
- the prediction ball is independent from learning progress;
- storage should remain economical by default;
- Mini App requests that depend on Telegram identity must respect signed `initData` validation.

## Current rollout status

At the time this context was written:

- local implementation has been checked with tests and build;
- migration `014` still needs to be applied for the new functionality;
- Qwen is the selected primary AI provider;
- Anthropic remains an alternative provider;
- local live Qwen checks passed with `qwen3.8-max`: JSON output and a two-turn library dialogue; deployed runtime remains unverified;
- deployment and reminder enablement are still required for launch.

Treat this as rollout context, not as a permanent architectural invariant.
Verify current state before acting on it.

## Working principle

Prefer the smallest coherent change that solves the task.

Do not:

- rewrite working architecture for aesthetics;
- duplicate an existing module or flow without a reason;
- move deterministic state into AI prompts;
- infer booking/progress/completion from AI text;
- introduce production side effects merely to test code;
- weaken validation to make a failing test pass.

When the same mistake repeatedly requires manual correction, prefer a test, schema, type, runtime guard or clearer module boundary over adding more prose rules.

## Complex work

Use an ExecPlan for work such as:

- new or materially changed user flows;
- stage/state-machine changes;
- Supabase migrations;
- storage-interface changes;
- AI provider migration;
- Mini App authentication changes;
- reward/progress redesign;
- reminder/cron redesign;
- admin export/data changes;
- multi-module refactors.

Do not create an ExecPlan for small local edits.

## Completion

A task is complete when:

- requested behavior is implemented;
- relevant existing behavior is preserved;
- meaningful verification has been performed;
- important limitations are stated;
- migration/deployment steps are identified if relevant;
- durable docs are updated only when necessary.
