# System Map — Neiroclozer / ai-neurosaler

## Purpose

This file maps important user/product flows to the code areas that implement them.
Use it to orient work before editing.
Do not treat it as a substitute for inspecting the current code.

---

## Flow 1 — Marketing quiz → qualification → analysis → Alexander

### Product path

```text
Telegram user
→ marketing quiz
→ qualification
→ preliminary analysis of materials
→ request/context prepared
→ transfer to Alexander
```

### Primary code areas

- `app/api/telegram/webhook/route.ts`
- `lib/neiroclozer/`

Inspect current quiz/state/storage functions before editing.

### State concerns

- preserve existing user stages;
- qualification results must remain consistent with stored lead state;
- analysis may use AI, but stage progression should remain application-controlled;
- transfer to Alexander should not lose the user's formulated context.

### Verification focus

- quiz can be entered and completed;
- valid answers advance correctly;
- invalid/unexpected input does not corrupt stage;
- qualification result persists correctly;
- preliminary analysis receives the expected context;
- transfer/request state is stored as intended.

---

## Flow 2 — Free AI dialogue

### Product path

```text
Telegram message
→ webhook
→ identify user/lead
→ load recent context
→ common AI module
→ provider
→ response
→ Telegram
```

### Primary code areas

- `app/api/telegram/webhook/route.ts`
- `lib/neiroclozer/`
- `lib/storage/`
- `lib/telegram.ts`

### Context rule

Recent dialogue should consider the limited stored history.
Current default storage principle: last **12 messages**.

Do not assume the implementation literally slices 12 at every call; inspect the storage/context code.

### Verification focus

- recent messages are included as intended;
- old unlimited history is not accidentally loaded;
- provider errors are handled without corrupting state;
- user stage remains valid after free dialogue.

---

## Flow 3 — Audit

### Product path

```text
user selects "Аудит"
→ system asks/accepts task in user's own words
→ audit request saved in CRM
→ calendar link sent
```

### Primary code areas

- `app/api/telegram/webhook/route.ts`
- `lib/neiroclozer/`
- `lib/storage/`
- `lib/telegram.ts`

### Critical invariant

```text
calendar link sent
≠ confirmed booking
```

### Verification focus

- user's task text is stored;
- audit request is associated with the correct lead;
- calendar link is sent;
- no confirmed booking state is written merely because the link was sent.

---

## Flow 4 — Library: AI для жизни / AI для бизнеса

### Product path

```text
user opens library
→ choose direction/material
→ material/recommendation
→ progress update
→ route update
→ possible reward
```

### Primary code areas

- `lib/library/`
- `lib/storage/`
- Telegram navigation code
- `library_materials` data

### Content location

Telegraph URLs are stored in `library_materials`.

### Important rules

- material count is dynamic;
- repeat completion does not duplicate completion/reward;
- AI can recommend a material/route, but does not mark it completed;
- progress is factual application state.

### Verification focus

- current material total comes from data;
- completion is idempotent;
- reward is idempotent;
- recommendations do not mutate completion by themselves;
- `AI для жизни` and `AI для бизнеса` navigation uses current data.

---

## Flow 5 — Telegram Mini App personal journey

### Product path

```text
Telegram Mini App
→ signed initData
→ `app/api/journey/`
→ user/profile/progress data
→ personal route / achievements / active days / reminder settings
→ `app/journey/`
```

### Primary code areas

- `app/journey/`
- `app/api/journey/`
- `lib/library/`
- `lib/storage/`

### Security boundary

Mini App server-side identity relies on validated Telegram `initData`.
Do not trust arbitrary client-supplied user identity in place of signed Telegram data.

### Verification focus

- valid `initData` is accepted;
- invalid/tampered `initData` is rejected;
- correct user data is returned;
- route/progress/achievement state is not duplicated;
- reminder settings persist correctly.

---

## Flow 6 — Prediction ball

### Product path

```text
user opens prediction ball
→ check 24h eligibility
→ local random result
→ store/return result as required
→ optional share
```

### Primary code areas

- `lib/prediction-ball.ts` — Telegram screens, local random, animation, sharing and cooldown handling.
- `lib/library/telegram.ts` — life-category entry, ball callbacks and `/start ball` routing.
- `lib/storage/` — atomic 24-hour eligibility check and spin event persistence.
- `supabase/sql/013_prediction_ball_daily_limit.sql` — Supabase cooldown RPC.

The ball runs inside the Telegram bot; it is not a Mini App screen or a library material.

### Important rules

- local random;
- usable once per 24 hours;
- shareable;
- independent from educational progress.

### Verification focus

- first eligible use works;
- repeated use inside 24h is handled according to current UX;
- use after the cooldown works;
- sharing does not mutate progress;
- prediction usage does not issue learning rewards.

---

## Flow 7 — Reminder system

### Product path

```text
user reminder settings
→ stored preference
→ cron
→ select eligible users
→ reminder send
```

### Primary code areas

- `lib/library/`
- cron Route Handler(s)
- `lib/storage/`
- `lib/telegram.ts`

Inspect actual cron path and scheduling configuration.

### Verification focus

- only eligible users are selected;
- reminder settings are respected;
- duplicate execution does not create unwanted duplicate sends;
- code existence is not confused with cron being enabled in deployment.

---

## Flow 8 — Telegram admin

### Product path

```text
admin command/navigation
→ `lib/telegram-admin.ts`
→ storage/query layer
→ analytics / leads / conversations / CSV / settings
```

### Primary code areas

- `lib/telegram-admin.ts`
- `lib/storage/`
- relevant Telegram webhook routing

### Verification focus

- admin access rules remain intact;
- analytics queries return expected data;
- lead/conversation views use current storage model;
- CSV generation is valid;
- settings changes affect the intended behavior only.

---

## Flow 9 — Storage abstraction

### Runtime path

```text
product logic
→ `lib/storage/` interface
→ Supabase adapter
   or
→ local adapter
```

### Purpose

Allow the same product logic to work with persistent Supabase storage and local/testing storage without duplicating domain logic.

### Verification focus

When changing the interface:

- inspect both adapters;
- keep semantics aligned;
- update all call sites;
- verify local and Supabase behavior where practical.

---

## Flow 10 — AI provider path

### Runtime path

```text
Neiroclozer/library context
→ common AI module
→ configured provider
→ Qwen or Anthropic
→ normalized result
```

### Current provider state

- Qwen selected as primary;
- Anthropic remains available as alternative;
- local live calls passed with `qwen3.8-max`: JSON output and a two-turn library dialogue; deployed runtime remains unverified.

### Verification focus

- provider selection comes from current configuration;
- provider-specific failures do not corrupt product state;
- product/domain logic does not depend on provider-specific response quirks where avoidable;
- once credentials exist, perform a real safe Qwen request before calling the integration verified.

---

## Flow 11 — Database migration / rollout

### Current rollout path

```text
local tested implementation
→ apply migration 014
→ configure Qwen
→ deploy
→ enable reminders
→ verify live integrations
```

This is current operational context, not a permanent flow.
Before execution, inspect current migration/deployment state because some steps may already be complete.
