# Engineering Decisions — Neiroclozer / ai-neurosaler

This file records durable, non-obvious decisions that should not be accidentally undone.
It is not a changelog.

---

## Decision — One Next.js application

### Context

Telegram webhook handling, Mini App APIs and the Mini App UI belong to the same product.

### Decision

Neiroclozer is implemented as one Next.js 16 application with React 19 and TypeScript.
Telegram Route Handlers and Mini App Route Handlers live inside the same application.

### Why

- shared product context;
- shared storage;
- shared authentication/integration code;
- simpler deployment model.

### Revisit when

Only if operational scale or isolation requirements justify splitting services.

---

## Decision — Shared storage interface

### Context

The product uses Supabase in real operation and a local adapter for local/testing behavior.

### Decision

Product logic should use the common storage interface in `lib/storage/` where applicable.

### Why

- separates product logic from persistence vendor details;
- supports local/testing workflows;
- keeps storage behavior explicit.

### Revisit when

If the persistence architecture is intentionally redesigned.

---

## Decision — Preserve existing flows and extend modules

### Context

The system already contains working user stages and scenario modules.

### Decision

New functionality should preserve active scenarios/stages and extend existing modules before creating parallel implementations.

### Why

- lowers regression risk;
- avoids duplicated business logic;
- keeps flow ownership understandable.

### Revisit when

A deliberate migration/rewrite is planned and verified.

---

## Decision — AI is advisory; application owns factual state

### Context

The AI can generate analysis, recommendations and dialogue, but model output is non-deterministic.

### Decision

AI may recommend answers, materials, routes and explanations.
Application/storage logic owns factual state such as completion, rewards, booking state, audit persistence, progress and cooldowns.

### Why

- deterministic state is testable;
- provider/model changes cannot redefine product facts;
- repeated events can be made idempotent.

### Revisit when

Only if model-driven state is introduced together with an explicit validation/control layer.

---

## Decision — Calendar link is not confirmed booking

### Context

The audit flow ends by giving the user a calendar link.

### Decision

Sending or exposing that link does not mark an appointment as confirmed.

### Why

The actual booking happens outside this action and requires separate evidence/state.

### Revisit when

A real calendar integration provides authoritative booking confirmation.

---

## Decision — Material count is dynamic

### Context

The library can gain or lose materials.

### Decision

The product derives the number of materials from current data rather than hardcoding a total.

### Why

- prevents UI/progress drift;
- supports content growth without code changes.

---

## Decision — Completion and rewards are idempotent

### Context

Telegram callbacks, page reloads or repeated requests may happen more than once.

### Decision

Repeated completion actions must not duplicate completion or reward issuance.

### Why

- prevents incorrect progress;
- prevents duplicate achievements/rewards;
- makes retries safe.

---

## Decision — Prediction ball is independent from learning progress

### Context

The prediction ball is a playful feature with a 24-hour cooldown.

### Decision

Prediction-ball usage does not advance educational/library progress and does not issue learning rewards.

### Why

The feature serves a different product purpose.

### Revisit when

Only if product design intentionally connects it to a separate gamification system.

---

## Decision — Compact storage by default

### Context

The product does not need unlimited historical data for every interaction.

### Decision

Storage remains economical by default:

- recent conversation history is limited;
- current default context is the latest 12 messages;
- stored material text is limited;
- user profile is compact;
- not every user action is stored forever.

### Why

- lower storage cost;
- simpler context assembly;
- less unnecessary event data;
- better control of AI context size.

### Revisit when

A concrete product/analytics requirement needs longer retention.

---

## Decision — Provider abstraction with Qwen primary

### Context

The AI layer supports more than one provider.

### Decision

Use the common AI module/provider boundary.
Current product intent:

- Qwen is primary;
- Anthropic remains an alternative provider.

### Why

- provider choice stays replaceable;
- product logic remains vendor-independent.

### Current limitation

Local live Qwen connectivity has been verified with `qwen3.8-max`, including JSON output and a two-turn library dialogue. Deployed runtime has not been verified by these checks.

---

## Decision — Telegraph URLs live in library data

### Context

Library materials link to Telegraph.

### Decision

Telegraph URLs are stored in `library_materials` instead of being hardcoded across UI/business logic.

### Why

- content can change without scattered code edits;
- material metadata stays centralized.

---

## Decision — Mini App identity uses signed Telegram initData

### Context

The Mini App receives user context from Telegram.

### Decision

Server-side Mini App identity-sensitive operations validate signed Telegram `initData`.

### Why

Client-provided identifiers alone are not authoritative.
