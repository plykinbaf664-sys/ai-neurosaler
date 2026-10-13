# Architecture — Neiroclozer / ai-neurosaler

## Purpose

This document describes the current architectural model and durable boundaries of the project.
It should help an engineer or coding agent navigate the system without forcing an unnecessary rewrite.

## Technology

Current architecture:

- **Next.js 16**
- **React 19**
- **TypeScript**
- Telegram as the main user interface
- Telegram Mini App as an additional personalized interface
- Next.js Route Handlers for Telegram webhook and Mini App API
- Supabase PostgreSQL as the main persistent storage/CRM
- local storage adapter for local/test usage
- common/pluggable AI provider module
- cron for reminders

## High-level system

```text
Telegram / Mini App
        ↓
Next.js API
        ↓
scenario / product logic
        ↓
AI provider when needed
        ↓
common storage interface
        ↓
Supabase PostgreSQL / local adapter
```

Not every flow needs the AI provider.
Deterministic flows should bypass AI when AI is unnecessary.

## Main code areas

### Telegram entry

`app/api/telegram/webhook/route.ts`

Responsible for incoming:

- messages;
- commands;
- button/callback actions.

The webhook should primarily route platform input into product flows rather than becoming the entire business-logic layer.

### Neiroclozer domain

`lib/neiroclozer/`

Contains logic related to:

- marketing quiz;
- audit flow;
- preliminary material analysis;
- prompts;
- AI requests.

Prefer extending this area for Neiroclozer-specific behavior instead of creating parallel duplicated logic elsewhere.

### Library domain

`lib/library/`

Contains logic related to:

- library;
- dialogue/recommendations;
- personal route;
- progress;
- rewards;
- reminders.

Library completion and reward state should remain deterministic and idempotent.

### Storage

`lib/storage/`

Provides a common storage interface and adapters for:

- Supabase;
- local/test usage.

Product/domain code should prefer the common interface rather than directly coupling every module to Supabase.

### Telegram integration

- `lib/telegram.ts`
- `lib/telegram-admin.ts`

Responsibilities include Telegram API operations and admin-specific Telegram behavior.

### Mini App

- `app/journey/`
- `app/api/journey/`

The Mini App exposes user-facing journey data and related APIs.
Server-side Mini App requests relying on Telegram identity must validate signed Telegram `initData`.

### Database evolution

`supabase/sql/`

Contains sequential schema/data migrations.
Migrations are part of the system history and rollout path.

Do not edit an already-applied migration merely to change current behavior unless the project explicitly uses that migration strategy.
Prefer a new sequential migration for durable schema/data changes.

## AI provider boundary

The project uses a common AI module.

Current provider intent:

```text
common AI interface
    ├── Qwen (primary)
    └── Anthropic (alternative)
```

Product logic should depend on the shared abstraction where possible.
Provider-specific behavior should stay localized enough that switching/fallback does not redefine product state.

## Storage boundary

The storage layer exists to keep product logic independent from one concrete persistence implementation.

Prefer:

```text
product/scenario logic
        ↓
storage interface
        ↓
Supabase adapter / local adapter
```

Avoid direct Supabase access from unrelated UI/flow modules if the same operation belongs in the shared storage interface.
Do not abstract purely for aesthetics; extend the interface when a real product operation needs durable storage behavior.

## Product-state boundaries

### AI vs factual state

AI may generate:

- answer text;
- analysis;
- recommendations;
- route suggestions.

Application/storage logic owns factual state such as:

- completion;
- rewards;
- booking state;
- progress;
- stored audit request;
- prediction-ball cooldown.

### Audit vs booking

```text
audit request saved
→ calendar link sent
≠ confirmed booking
```

Do not collapse these into one status.

### Prediction ball vs learning progress

Prediction-ball usage is its own feature state.
It must not modify material completion, route completion or learning rewards.

### Completion/reward idempotency

Repeated requests/reloads/callbacks must not duplicate completion, achievements or rewards.
Use existing storage/state mechanisms before inventing new duplicate guards.

### Material count

Total material count is dynamic.
Do not hardcode counts into UI/business logic when the data source can provide the current number.

## Data-economy boundary

The system intentionally avoids unlimited storage.

Current product principles include:

- recent conversation history: last 12 messages by default;
- limited material text;
- compact user profile;
- no exhaustive log of every user action by default.

New features should not silently turn the product into an unlimited event/message warehouse.
If a feature genuinely needs more retention, treat that as an explicit product/data decision.

## Reminder boundary

Reminder configuration belongs to user/product state.
Cron executes reminder work.

When changing reminder behavior, consider:

- user setting;
- eligibility;
- duplicate send risk;
- timezone/time logic if implemented;
- current progress/state;
- deployment/cron enablement.

Do not assume reminder cron is active merely because code exists.

## Architecture guidance

Prefer:

- extending existing modules;
- deterministic state transitions;
- common storage interface;
- provider abstraction;
- explicit flow ownership;
- scoped Route Handlers;
- testable domain functions.

Avoid:

- business-critical state hidden only in prompts;
- hardcoded material counts;
- duplicate reward paths;
- direct provider coupling across the application;
- using AI text as proof of booking/completion;
- parallel modules that duplicate an existing domain without a concrete reason.

These are architectural directions, not reasons to refactor unrelated working code.
