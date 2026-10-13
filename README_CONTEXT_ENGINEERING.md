# Context Engineering — Neiroclozer / ai-neurosaler

This repository uses a lightweight context-engineering structure for human + AI development.

The goal is not to constrain the coding agent with a giant instruction manual.
The goal is to give it:

1. a clear product model;
2. a map of important flows;
3. architecture and module boundaries;
4. a reliable verification strategy;
5. a record of durable decisions.

## Structure

```text
AGENTS.md
README_CONTEXT_ENGINEERING.md

docs/
├── PROJECT_CONTEXT.md
├── ARCHITECTURE.md
├── SYSTEM_MAP.md
├── VERIFICATION.md
├── DECISIONS.md
└── AGENT_WORK_STYLE.md

.agent/
└── PLANS.md
```

Optional execution plans live in `.agent/plans/`.

## Role of each file

### `AGENTS.md`

Short always-on project router.
It explains how to approach work, which document to read for which task, important cross-project invariants, and when to create a larger plan.
Keep it compact.

### `docs/PROJECT_CONTEXT.md`

Durable product context: what Neiroclozer does, who it serves, main scenarios, business meaning of important states and current product boundaries.

### `docs/ARCHITECTURE.md`

Architecture and integration model: Next.js, Telegram, Mini App, Route Handlers, AI providers, storage abstraction, Supabase/local adapters, cron and Telegram `initData`.

### `docs/SYSTEM_MAP.md`

Operational map from user behavior to code areas.
Use it to answer where a flow starts, which modules participate, what state changes and how to verify it.

### `docs/VERIFICATION.md`

Defines how to prove behavior works without blindly running the entire system after every edit.

### `docs/DECISIONS.md`

Stores only durable, non-obvious decisions that future engineers or agents may otherwise accidentally undo.

### `docs/AGENT_WORK_STYLE.md`

Soft engineering guidance. These principles should improve agent judgment, not replace it.

### `.agent/PLANS.md`

Defines when and how to create an ExecPlan for substantial work.

## Maintenance principle

Documentation should contain information that materially helps future work.

Do not document:

- every file;
- temporary implementation details;
- every completed task;
- obvious code behavior;
- speculative future architecture.

When a repeated failure is caused by a stable rule, prefer enforcing it in the environment:

- tests;
- schemas;
- types;
- database constraints;
- runtime guards;
- linters;
- CI.

The repository should carry as much correctness as possible, while documentation carries intent and navigation.
