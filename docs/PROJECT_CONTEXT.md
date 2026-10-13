# Project Context — Neiroclozer / ai-neurosaler

## What the product is

**Neiroclozer / ai-neurosaler** is Alexander's Telegram bot for attracting and accompanying potential clients.

The product helps a person:

- formulate their task;
- understand relevant applications of AI;
- receive useful materials and recommendations;
- complete qualification flows;
- send an audit request;
- move toward a call with Alexander when there is sufficient interest.

The existing Supabase database acts as the CRM and persistent product storage.

## Primary product outcome

Move a person from initial interest in AI toward a useful next step while preserving context and avoiding unnecessary manual work.

The system should support education, qualification and commercial progression without pretending that an AI-generated recommendation is a factual business event.

## Primary interfaces

### Telegram bot

The main interface for:

- messages;
- commands;
- buttons;
- qualification;
- AI dialogue;
- audit;
- library navigation;
- admin functionality.

### Telegram Mini App

Provides a personal product surface for:

- personal route;
- achievements;
- active days;
- reminder settings.

### Admin interface inside Telegram

Used for:

- analytics;
- lead review;
- conversation review;
- CSV export;
- settings.

## Main scenarios

### 1. Marketing quiz

```text
marketing quiz
→ qualification
→ preliminary analysis of materials
→ transfer of the request to Alexander
```

The quiz is a product flow, not just AI conversation.
Important stages and exact field names must be taken from the current implementation.

### 2. Free AI dialogue

A user can speak with the AI outside rigid scripted flows.
The AI should take recent conversation history into account.
The system stores a limited history rather than an unlimited transcript.

### 3. Audit flow

```text
"Аудит"
→ user describes the task in their own words
→ request is saved in CRM
→ calendar link is provided
```

Important invariant:

> Sending a calendar link does **not** mean the user has a confirmed booking.

The application must not mark a booking as confirmed merely because a link was sent or opened.

### 4. Library

There are two main directions:

- `AI для жизни`
- `AI для бизнеса`

The library supports:

- materials;
- progress;
- recommendations;
- rewards.

Material URLs are stored in `library_materials` and point to Telegraph content.
The total number of materials must be calculated dynamically rather than hardcoded.

### 5. Telegram Mini App

The Mini App provides:

- personalized route;
- achievements;
- active-day tracking;
- reminder settings.

Telegram-signed `initData` is used to validate Mini App identity/server requests.

### 6. Prediction ball

The "Шар предсказаний" feature:

- uses local random behavior;
- can be used once every 24 hours;
- can be shared;
- is separate from educational/library progress.

Using the prediction ball must not advance learning progress or produce learning rewards.

### 7. Telegram admin

The admin surface provides:

- analytics;
- leads;
- conversations;
- CSV export;
- settings.

## Main system actors

### User / lead

A person interacting with the Telegram bot and/or Mini App.

### Alexander

The human expert who receives qualified/audit requests and continues commercial communication.

### AI layer

Generates helpful responses, analysis, recommendations and route suggestions.

### Admin/operator

Uses the Telegram admin interface to inspect leads, conversations, analytics and settings.

## Core product rule: AI is advisory, state is deterministic

The AI can:

- suggest answers;
- explain;
- recommend materials;
- propose a route;
- help formulate a task;
- generate contextual dialogue.

The AI does **not** define the factual state of:

- material completion;
- reward issuance;
- confirmed booking;
- user progress;
- active-day accounting;
- stored audit request.

Those states belong to application/storage logic.

## Storage principles

Supabase stores:

- leads;
- limited recent message history;
- audit requests;
- materials;
- progress;
- events;
- user profile.

Storage is intentionally economical.

Current principle:

- keep the last **12 messages** by default;
- store only limited material text needed by the system;
- keep the profile compact;
- do not store a full history of every user action unless the product explicitly needs it.

Exact schema and retention implementation must be verified in code/migrations.

## AI providers

The application uses a common AI module/provider abstraction.

Current intended configuration:

- **Qwen** — selected primary provider;
- **Anthropic** — retained as an alternative provider.

Local live Qwen checks passed with `qwen3.8-max`: JSON output and a two-turn library dialogue with material recommendations. Deployed runtime remains unverified.
Do not treat provider selection as a reason to couple product logic directly to one vendor.

## Reminder system

Reminders run through cron.
Mini App allows reminder configuration.

Reminder logic must respect current user settings/state and should avoid duplicate sends where the existing implementation already provides idempotency/state protection.

## Current launch state

The current implementation has been checked locally with tests and build.

Remaining launch work stated in current project context:

1. apply migration `014`;
2. verify the deployed Qwen environment (local credentials and live calls are already checked);
3. deploy;
4. enable reminders.

Local provider connectivity is verified; this does not prove that the deployed Telegram bot uses the same environment.

This section is operational status and may become stale; verify before using it as current truth.

## Product principles

- Preserve working user scenarios and stages.
- Extend existing modules before adding parallel implementations.
- Keep deterministic product state outside AI output.
- Calculate library size dynamically.
- Prevent duplicate completion/reward issuance.
- Keep prediction-ball state independent from learning progress.
- Do not confuse a calendar link with a confirmed appointment.
- Keep storage intentionally compact.
- Preserve Telegram as the primary interaction surface.
