# AI-карта бизнеса

## Goal
Первый экран обещает персональную карту: три процесса, приоритет, самостоятельная практика и разбор процесса с Александром. Обе библиотеки доступны напрямую.

## Current behavior
`webhook → library/telegram → menu` при LIBRARY_ENABLED; старый marketing quiz содержит три A–D вопроса и суммарный scoring, затем анализ материалов. Audit сохраняет запрос и выдаёт календарь без подтверждения бронирования. Scheduler использует cron/library-followups и атомарный claim; ежедневное расписание не покрывает часовые интервалы.

## Scope and invariants
Добавляем карту в существующий webhook, визуалы в Telegram helpers, четыре шага в существующий cron. Старые marketing callbacks/stages, Qwen/Anthropic, Telegraph, динамический прогресс, идемпотентные награды, Mini App auth и независимый prediction ball сохраняются. Новый frontend, очередь и CMS не нужны.

## Approach
1. Аддитивная 016: компактное состояние карты в library profile, отдельный due timestamp; общий reusable visual cache и атомарные claims.
2. Пять коротких вопросов с детерминированным подбором трёх процессов по фактическим ответам. Старый marketing scoring не меняется; обновляется только язык вопросов.
3. Onboarding, admin video capture, cached image generation с ограниченным timeout и text fallback.
4. Существующий audit CTA; остановка follow-up при отказе/CTA/handoff/lead/converted/blocked. Claim до отправки: at-most-once, неопределённая доставка не повторяется.
5. Mocked webhook/provider/storage integration tests, оба адаптера, SQL в изолированной БД при наличии PGlite, lint/typecheck/build.

## Data / provider impact
016 после 015; новые nullable поля совместимы со старыми профилями. Миграция нужна до включения карты/изображений. LLM provider не меняется. Отдельный маленький image adapter OpenAI Images API, без приватных ответов в visual prompts; cache хранит только Telegram file_id и lease. Live provider/Telegram/production DB не вызываются для проверки.

## External side effects / rollout
Код умеет отправлять video/photo/text и follow-up; тесты перехватывают fetch. Продакшен deploy/migration не выполняются без прямой задачи на rollout. Vercel Cron Jobs в репозитории ежедневные, совместимые с Hobby. Для +1/+3-часовых сообщений внешний HTTP scheduler вызывает существующий library-followups endpoint каждые 5 минут; параметры описаны в rollout-инструкции.

## Verification matrix
| Outcome | Evidence |
|---|---|
| Start, payloads, video fallback, admin capture | mocked webhook |
| Answers, result, actual material links, old score | domain + webhook |
| Four due steps, stops, concurrent/restart idempotency | scheduler + SQL claims |
| Cache reuse/concurrency/provider failure | mocked image/Telegram + SQL |
| Library, ball, completion, audit, dialogue | existing regression suites |

## Progress
- [x] Inspect current behavior and audit all existing quiz questions: all three affect score/result; no dead question removed.
- [x] Implement
- [x] Verify
- [x] Document rollout and limitations

## Result
Implemented the flagged main entry, five-answer deterministic map, personal existing-library track, process-review CTA, welcome video/admin capture, image asset cache and four scheduler steps. Old marketing scores/stages and independent library/ball behavior remain.

Verification: 73/73 full regression tests, 21/21 dialogue checks through mocked Qwen, 19/19 focused map checks after final route wiring; lint/typecheck and production build passed. Isolated PGlite applied all migrations, repeated 016, verified CAS/stop/claims/lease permissions. Two fresh file-storage processes verified restart persistence. A payload-routing regression found by the ball suite was fixed behind the AI-map flag.

Production deployment, Supabase migration execution, credential configuration, live image generation/Telegram delivery and scheduler activation were not performed. Rollout instructions: `docs/AI_MAP_ROLLOUT.md`. Production requires persistent Supabase storage; frequent cron requires a supporting hosting plan or an external caller of the existing endpoint. At-most-once follow-up claims intentionally do not retry uncertain deliveries. Missing catalogue matches remain explicit manual exercises rather than invented material links.

Follow-up: strengthened visual reuse. Cache identity is now screen + bot identity + visual version, independent of generator configuration and bot secret rotation. Cache hits are sent before validating generator credentials. Existing model-dependent assets are adopted without regeneration. Focused tests cover model/provider/key removal and legacy-cache adoption.

Hobby rollout correction: restored library-followups to daily `15 12 * * *` in vercel.json so deployment no longer requests an unsupported sub-daily Vercel cron. The endpoint, four deadlines and durable claims stay unchanged. External 5-minute scheduler setup is documented; it has not been provisioned. Daily fallback alone cannot meet the 1h/3h deadlines.
