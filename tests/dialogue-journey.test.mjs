import "./register-typescript.mjs";
import assert from "node:assert/strict";
import { test, beforeEach, after } from "node:test";
import { createHmac } from "node:crypto";

const testProvider = process.env.TEST_AI_PROVIDER === "qwen" ? "qwen" : "anthropic";
Object.assign(process.env, { AI_PROVIDER: testProvider, QWEN_API_KEY: "test-qwen-key", QWEN_BASE_URL: "https://qwen.test/compatible-mode/v1", QWEN_MODEL: "qwen-plus",
  STORAGE_DRIVER: "local", LOCAL_DATA_MODE: "memory", LIBRARY_ENABLED: "true", LIBRARY_FOLLOWUPS_ENABLED: "false",
  LIBRARY_LINK_SECRET: "test-library-secret-at-least-24-characters", TELEGRAM_BOT_TOKEN: "journey-test", TELEGRAM_WEBHOOK_SECRET: "test-secret", TELEGRAM_ADMIN_USER_ID: "9999999", ANTHROPIC_API_KEY: "test-ai-key" });
const storage = await import("../lib/storage/index.ts");
const { POST: webhook } = await import("../app/api/telegram/webhook/route.ts");
const { POST: journeyApi } = await import("../app/api/journey/route.ts");
const { verifyTelegramWebAppData } = await import("../lib/security/telegram-webapp.ts");
const { convertMarkdownToTelegramHtml } = await import("../lib/telegram.ts");
const { getPublicBaseUrl } = await import("../lib/public-links.ts");
const { isAuditRequest } = await import("../lib/neiroclozer/audit.ts");
const { detectPostQuizIntent } = await import("../lib/neiroclozer/post-quiz-intent.ts");
const { parseJourneyReply } = await import("../lib/library/dialogue.ts");
const { getJourneyDashboard } = await import("../lib/library/journey.ts");
const { sendDueLibraryFollowups, scheduleNextStepFollowup } = await import("../lib/library/followups.ts");
const { markMaterialCompleted } = await import("../lib/library/progress.ts");
const { getNextMaterialAfter } = await import("../lib/library/recommendations.ts");
const allMaterials = await storage.getActiveLibraryMaterials();
const decision = allMaterials.find(m => m.topic === "decision_making");
let sequence = 100;
let aiReply = "Ответ на текущую реплику";
let chosenIds = [];
let goal = null;
let routeAction;
let revisitMaterialIds = [];
let rawJourneyReply = null;
let providerError = false;
const calls = [];
const prompts = [];
const originalFetch = globalThis.fetch;
globalThis.fetch = async (url, init) => {
  const aiEndpoint = testProvider === "qwen" ? "https://qwen.test/compatible-mode/v1/chat/completions" : "https://api.anthropic.com/v1/messages";
  if (String(url) === aiEndpoint) {
    if (testProvider === "qwen") assert.equal(init.headers.Authorization, "Bearer test-qwen-key");
    if (providerError) return Response.json({ error: { type: "invalid_request_error", message: "Your credit balance is too low" } }, { status: 400 });
    const prompt = JSON.parse(init.body).messages[0].content;
    prompts.push(prompt);
    const text = prompt.includes("Ответ строго JSON") ? rawJourneyReply ?? JSON.stringify({ reply: aiReply, goal, materialIds: chosenIds, routeAction, revisitMaterialIds }) : aiReply;
    return Response.json(testProvider === "qwen" ? { choices: [{ message: { content: text }, finish_reason: "stop" }] }
      : { content: [{ type: "text", text }] });
  }
  assert.ok(String(url).startsWith("https://api.telegram.org/botjourney-test/"), `Unexpected call ${url}`);
  const body = init?.body ? JSON.parse(init.body) : {};
  calls.push({ method: String(url).split("/").at(-1), ...body });
  return Response.json({ ok: true, result: { message_id: ++sequence, text: body.text, username: "JourneyBot" } });
};
beforeEach(() => { calls.length = 0; prompts.length = 0; goal = null; chosenIds = []; routeAction = undefined; revisitMaterialIds = []; rawJourneyReply = null; providerError = false; aiReply = "Ответ на текущую реплику"; process.env.LIBRARY_FOLLOWUPS_ENABLED = "false"; });
after(() => { globalThis.fetch = originalFetch; });

async function post(text, user, callback = false) {
  const from = { id: user, first_name: "Test" };
  const message = { message_id: ++sequence, from, chat: { id: user, type: "private" }, text };
  const update = callback ? { callback_query: { id: `cb-${sequence}`, from, message, data: text } } : { message };
  const response = await webhook(new Request("https://neiro.test/api/telegram/webhook", { method: "POST", headers: { "x-telegram-bot-api-secret-token": "test-secret" }, body: JSON.stringify(update) }));
  assert.equal(response.status, 200, await response.clone().text());
  return response.json();
}
const lastMessage = () => calls.filter(call => call.method === "sendMessage").at(-1);
function signedData(id, time = Math.floor(Date.now() / 1000)) {
  const params = new URLSearchParams({ user: JSON.stringify({ id, first_name: "Test" }), auth_date: String(time), query_id: "abc" });
  params.sort();
  const secret = createHmac("sha256", "WebAppData").update(process.env.TELEGRAM_BOT_TOKEN).digest();
  params.set("hash", createHmac("sha256", secret).update([...params].map(([key, value]) => `${key}=${value}`).join("\n")).digest("hex"));
  return params.toString();
}

test("Telegram link rendering escapes URL query parameters exactly once and leaves them out of formatting", () => {
  const output = convertMarkdownToTelegramHtml('[Запись & время](https://example.test/book?one=1&two=**2**&x=$&)');
  assert.ok(output.includes('href="https://example.test/book?one=1&amp;two=**2**&amp;x=$&amp;"'));
  assert.ok(!output.includes("amp;amp"));
  assert.ok(output.includes("Запись &amp; время"));
  assert.ok(convertMarkdownToTelegramHtml('[Read](https://example.test/a_(b))').includes('href="https://example.test/a_(b)"'));
  assert.equal(convertMarkdownToTelegramHtml('`<unsafe>`'), '<code>&lt;unsafe&gt;</code>');
  process.env.TELEGRAM_WEBHOOK_BASE_URL = "https://public.test/api/telegram/webhook/";
  assert.equal(getPublicBaseUrl(), "https://public.test");
  delete process.env.TELEGRAM_WEBHOOK_BASE_URL;
});

test("audit keyword asks a free-form request, persists it in CRM, then sends calendar without claiming a booking", async () => {
  aiReply = "Что сейчас мешает продажам?";
  await post("аудит", 801);
  const lead = await storage.getLeadByTelegramUserId(801);
  assert.equal((await storage.getLeadById(lead.id)).current_stage, "audit_request_requested");
  assert.equal(lastMessage().text, aiReply);
  assert.ok(lastMessage().reply_markup.inline_keyboard.flat().some(button => button.callback_data === "nav:menu"));
  const request = "Хочу аудит продаж: много диалогов, но клиенты исчезают после цены";
  await post(request, 801);
  const updated = await storage.getLeadById(lead.id);
  assert.equal(updated.audit_request, request);
  assert.equal(updated.status, "needs_manual_followup");
  assert.equal(updated.current_stage, "handoff");
  assert.ok(updated.audit_requested_at);
  assert.ok(lastMessage().reply_markup.inline_keyboard[0][0].url.startsWith("https://calendar.app.google/"));
  const events = await storage.getRecentUserEvents(lead.id);
  assert.ok(events.some(event => event.event_name === "audit_request_saved"));
  for (let index = 0; index < 15; index++) await storage.insertMessage({ leadId: lead.id, expertProfileId: lead.expert_profile_id, direction: "incoming", channel: "telegram", telegramMessageId: 10000 + index, text: "Позже", messageType: "user" });
  assert.equal((await storage.getLeadById(lead.id)).audit_request, request);
  aiReply = "Я здесь. Расскажи, что произошло.";
  await post("Сегодня совсем не мой день", 801);
  assert.equal(lastMessage().text, aiReply);
  assert.equal((await storage.getLeadById(lead.id)).current_stage, "handoff");
});

test("audit intent does not hijack informational questions or refusals and navigation cancels pending intake", async () => {
  for (const text of ["Что такое аудит?", "не хочу аудит", "мы проводим аудиты"]) assert.equal(isAuditRequest(text), false);
  assert.equal(isAuditRequest("Хочу нейроаудит"), true);
  assert.equal(detectPostQuizIntent({ currentStage: "audit_offered", text: "У меня задача с продажами", hasDocument: false }), "unclear");
  await post("аудит", 802);
  await post("/start", 802);
  assert.equal((await storage.getLeadByTelegramUserId(802)).current_stage, "ecosystem_menu");
});

test("free dialogue uses history, builds a catalogue-validated track and keeps it during smalltalk", async () => {
  await post("/start", 803);
  goal = "Принять решение о новой работе";
  chosenIds = [decision.id, "invented-id", decision.id];
  aiReply = "Начни с короткой практики принятия решений — она поможет отделить факты от страхов.";
  await post("Не могу выбрать, менять ли работу", 803);
  const lead = await storage.getLeadByTelegramUserId(803);
  let profile = await storage.getUserLibraryProfile(lead.id);
  assert.equal(profile.journey_goal, goal);
  assert.deepEqual(profile.recommended_material_ids, [decision.id]);
  assert.equal(lastMessage().reply_markup.inline_keyboard[0][0].callback_data, `lib:mat:${decision.id}`);
  goal = null; chosenIds = []; aiReply = "Страх понятен. Что больше всего тревожит в переходе?";
  await post("Но я боюсь ошибиться", 803);
  assert.equal(lastMessage().text, aiReply);
  assert.ok(prompts.at(-1).includes("менять ли работу"));
  profile = await storage.getUserLibraryProfile(lead.id);
  assert.deepEqual(profile.recommended_material_ids, [decision.id]);
  const parsed = parseJourneyReply(JSON.stringify({ reply: "Ответ", materialIds: [decision.id, "bad"], goal: "" }), allMaterials, new Set([decision.id]));
  assert.deepEqual(parsed.materials, []);
});

test("quiz off-topic messages get contextual answers while the question remains pending", async () => {
  await post("/start", 804);
  await post("nav:marketing", 804, true);
  const lead = await storage.getLeadByTelegramUserId(804);
  const stage = lead.current_stage;
  aiReply = "Это короткий разбор того, где теряются заявки.";
  await post("Можешь объяснить, зачем эти вопросы?", 804);
  assert.equal(lastMessage().text, aiReply);
  assert.equal((await storage.getLeadById(lead.id)).current_stage, stage);
  assert.ok(lastMessage().reply_markup.inline_keyboard.length);
});

test("activity counts distinct days, completion awards are durable and concurrent grants do not duplicate", async () => {
  const lead = await storage.getLeadByTelegramUserId(803);
  await Promise.all(Array.from({ length: 8 }, () => storage.recordUserActivity(lead.id)));
  assert.equal((await storage.getUserLibraryProfile(lead.id)).active_days, 1);
  await storage.upsertUserLibraryProfile(lead.id, { last_active_date: "2000-01-01", active_days: 2 });
  await storage.recordUserActivity(lead.id);
  await markMaterialCompleted(lead.id, decision);
  const dashboard = await getJourneyDashboard(lead.id, "https://neiro.test");
  assert.ok(dashboard.rewards.find(reward => reward.key === "first_step").unlocked);
  assert.ok(dashboard.rewards.find(reward => reward.key === "active_3").unlocked);
  assert.equal(dashboard.total, allMaterials.length);
  assert.ok(dashboard.track[0].completed);
  await Promise.all(Array.from({ length: 5 }, () => storage.grantUserReward(lead.id, "first_step", {})));
  for (let index = 0; index < 205; index++) await storage.insertUserEvent({ userId: lead.id, eventName: "library_opened" });
  assert.equal((await storage.getUserRewards(lead.id)).filter(event => event.category === "first_step").length, 1);
  assert.ok((await getJourneyDashboard(lead.id, "https://neiro.test")).rewards.find(reward => reward.key === "first_step").unlocked);
});

test("Mini App authentication rejects forged, expired, future and duplicate data; API only returns the signed user's progress", async () => {
  const valid = signedData(803);
  assert.equal(verifyTelegramWebAppData(valid).id, 803);
  assert.equal(verifyTelegramWebAppData(valid.replace("803", "804")), null);
  assert.equal(verifyTelegramWebAppData(signedData(803, Math.floor(Date.now() / 1000) - 3601)), null);
  assert.equal(verifyTelegramWebAppData(signedData(803, Math.floor(Date.now() / 1000) + 60)), null);
  assert.equal(verifyTelegramWebAppData(`${valid}&user=bad`), null);
  const call = (auth) => journeyApi(new Request("https://neiro.test/api/journey", { method: "POST", headers: { Authorization: auth }, body: JSON.stringify({ action: "view", userId: "ignored" }) }));
  assert.equal((await call("tma fake")).status, 401);
  const result = await call(`tma ${valid}`);
  assert.equal(result.status, 200);
  assert.equal(result.headers.get("cache-control"), "private, no-store");
  assert.equal((await result.json()).completed, 1);
  assert.equal((await (await call(`tma ${signedData(804)}`)).json()).completed, 0);
});

test("personalized reminders run once under concurrent cron calls, stop on opt-out and skip recent activity", async () => {
  process.env.LIBRARY_FOLLOWUPS_ENABLED = "true";
  await post("/start", 805);
  const lead = await storage.getLeadByTelegramUserId(805);
  await storage.upsertUserLibraryProfile(lead.id, { last_route: "life", last_category: "life", recommended_material_ids: [decision.id], last_interaction_at: "2020-01-01T00:00:00.000Z", next_followup_due_at: "2020-01-02T00:00:00.000Z" });
  await Promise.all([sendDueLibraryFollowups(), sendDueLibraryFollowups()]);
  assert.equal(calls.filter(call => call.text?.includes(decision.short_description)).length, 1);
  await post("lib:reminders:off", 805, true);
  assert.equal((await storage.getUserLibraryProfile(lead.id)).reminders_enabled, false);
  assert.equal(await scheduleNextStepFollowup(lead.id), false);
  await storage.upsertUserLibraryProfile(lead.id, { reminders_enabled: true, last_followup_sent_at: null, next_followup_due_at: "2020-01-02T00:00:00.000Z", last_interaction_at: new Date().toISOString() });
  assert.equal((await sendDueLibraryFollowups()).sent, 0);
});

test("parallel completion stays single and a cross-category track keeps its selected order", async () => {
  await post("/start", 806);
  const lead = await storage.getLeadByTelegramUserId(806);
  const business = allMaterials.find(material => material.category === "business");
  await storage.upsertUserLibraryProfile(lead.id, { recommended_material_ids: [decision.id, business.id] });
  await Promise.all(Array.from({ length: 5 }, () => markMaterialCompleted(lead.id, decision)));
  assert.equal((await storage.getRecentUserEvents(lead.id, 100)).filter(event => event.event_name === "material_completed").length, 1);
  await storage.upsertLibraryProgress(lead.id, decision.id, "opened");
  assert.equal((await storage.getLibraryProgress(lead.id, [decision.id]))[0].status, "completed");
  assert.equal((await getNextMaterialAfter(lead.id, decision)).id, business.id);
});

test("opening an old gift link preserves handoff and records the click", async () => {
  const { GET } = await import("../app/api/gift/[leadId]/route.ts");
  const lead = await storage.getLeadByTelegramUserId(801);
  const result = await GET(new Request(`https://neiro.test/api/gift/${lead.id}?redirect=https%3A%2F%2Fexample.test%2Fgift`), { params: Promise.resolve({ leadId: lead.id }) });
  assert.equal(result.status, 302);
  assert.equal((await storage.getLeadById(lead.id)).current_stage, "handoff");
  assert.ok((await storage.getLeadById(lead.id)).gift_link_clicked_at);
});

test("AI billing outage is acknowledged without webhook retry loops; audit intake and booking still work", async () => {
  providerError = true;
  await post("аудит", 807);
  assert.ok(lastMessage().text.includes("Опиши свою ситуацию"));
  await post("Теряем клиентов после первой консультации", 807);
  assert.ok(lastMessage().reply_markup.inline_keyboard[0][0].url.includes("calendar"));
  await post("Можешь поддержать меня", 807);
  assert.ok(lastMessage().text.includes("не получилось подготовить ответ"));
  const lead = await storage.getLeadByTelegramUserId(807);
  assert.equal(lead.current_stage, "handoff");
  assert.ok(lead.audit_request);
});

test("AI outage keeps the library track and submitted analysis material available", async () => {
  providerError = true;
  const reader = await storage.getLeadByTelegramUserId(803);
  const previousTrack = (await storage.getUserLibraryProfile(reader.id)).recommended_material_ids;
  await post("Как применить этот материал к моей ситуации?", 803);
  assert.ok(lastMessage().text.includes("не получилось подготовить ответ"));
  assert.deepEqual((await storage.getUserLibraryProfile(reader.id)).recommended_material_ids, previousTrack);
  for (const [index, stage] of ["materials_requested", "audit_offered"].entries()) {
    const user = 810 + index;
    await post("/start", user);
    const lead = await storage.getLeadByTelegramUserId(user);
    await storage.updateLeadById(lead.id, { currentStage: stage });
    await storage.upsertUserLibraryProfile(lead.id, { last_route: "marketing" });
    await post("Проанализируй описание продукта: помогаем небольшим компаниям наладить продажи, подготовить предложения клиентам и сократить потери заявок после первой консультации.", user);
    assert.ok(lastMessage().text.includes("Материал сохранён"));
    assert.equal(await storage.getLeadMaterialsCount(lead.id), 1);
    assert.equal((await storage.getLeadById(lead.id)).current_stage, "audit_offered");
  }
});

test("post-calendar catalogue dialogue uses library context and always leaves navigation", async () => {
  await post("аудит", 830);
  await post("Хочу стабильный поток клиентов", 830);
  const lead = await storage.getLeadByTelegramUserId(830);
  assert.ok(lastMessage().reply_markup.inline_keyboard.flat().some(b => b.callback_data === "nav:menu"));
  chosenIds = [allMaterials.find(m => m.topic === "sales_audit").id];
  aiReply = "Начнём с проверки потерь в существующих диалогах.";
  await post("Какие материалы есть для бизнеса?", 830);
  assert.ok(prompts.at(-1).includes("DATA CATALOG"));
  assert.ok(prompts.at(-1).includes('"calendarBookingVerified":false'));
  assert.ok(prompts.at(-1).includes("Хочу стабильный поток клиентов"));
  assert.ok(lastMessage().text.includes("<b>Когда пригодится</b>"));
  assert.ok(lastMessage().reply_markup.inline_keyboard.flat().some(b => b.callback_data === "nav:menu"));
  assert.equal((await storage.getLeadById(lead.id)).current_stage, "handoff");
  await post("nav:menu", 830, true);
  assert.ok(lastMessage().reply_markup.inline_keyboard.flat().some(b => b.callback_data === "lib:cat:life"));
});

test("route changes without a new goal persist; feedback changes recommendations but never learning progress", async () => {
  await post("/start", 831);
  const lead = await storage.getLeadByTelegramUserId(831);
  const second = allMaterials.find(m => m.category === "life" && m.id !== decision.id);
  await storage.upsertUserLibraryProfile(lead.id, { journey_goal: "Разобраться с выбором", recommended_material_ids: [second.id] });
  chosenIds = [decision.id, second.id]; routeAction = "replace";
  await post("Покажи более подходящий порядок", 831);
  assert.deepEqual((await storage.getUserLibraryProfile(lead.id)).recommended_material_ids, chosenIds);
  routeAction = "keep"; chosenIds = [];
  await post(`lib:help:${decision.id}`, 831, true);
  assert.ok(prompts.at(-1).includes('"guidance"'));
  assert.ok(prompts.at(-1).includes(decision.title));
  await post(`lib:applied:${decision.id}`, 831, true);
  let dashboard = await getJourneyDashboard(lead.id, "https://neiro.test");
  assert.equal(dashboard.completed, 0);
  assert.equal(dashboard.track[0].feedback, "applied");
  assert.equal(dashboard.rewards.find(r => r.key === "first_step").unlocked, false);
  await post(`lib:skip:${decision.id}`, 831, true);
  const profile = await storage.getUserLibraryProfile(lead.id);
  assert.equal(profile.material_feedback[decision.id], "not_relevant");
  assert.deepEqual(profile.recommended_material_ids, [second.id]);
  dashboard = await getJourneyDashboard(lead.id, "https://neiro.test");
  assert.equal(dashboard.nextMaterialId, second.id);
  assert.equal((await getNextMaterialAfter(lead.id, decision)).id, second.id);
  chosenIds = [decision.id]; routeAction = "replace";
  await post("Что дальше?", 831);
  assert.deepEqual((await storage.getUserLibraryProfile(lead.id)).recommended_material_ids, [second.id]);
  assert.ok(!lastMessage().reply_markup.inline_keyboard.flat().some(b => b.callback_data === `lib:mat:${decision.id}`));
  assert.equal((await storage.getLibraryProgress(lead.id, allMaterials.map(m => m.id))).length, 0);
  assert.ok(!(await storage.getRecentUserEvents(lead.id)).some(e => e.event_name === "material_completed"));
  process.env.LIBRARY_FOLLOWUPS_ENABLED = "true";
  await storage.upsertUserLibraryProfile(lead.id, { last_interaction_at: "2020-01-01T00:00:00.000Z", next_followup_due_at: "2020-01-02T00:00:00.000Z" });
  await sendDueLibraryFollowups();
  assert.equal(lastMessage().reply_markup.inline_keyboard[0][0].callback_data, `lib:mat:${second.id}`);
});

test("empty and exhausted routes do not invent a next step; completed cards are explicitly revisits", async () => {
  await post("/start", 832);
  const lead = await storage.getLeadByTelegramUserId(832);
  await storage.upsertUserLibraryProfile(lead.id, { journey_goal: "Сделать выбор", recommended_material_ids: [decision.id], last_category: "life" });
  await markMaterialCompleted(lead.id, decision);
  let dashboard = await getJourneyDashboard(lead.id, "https://neiro.test");
  assert.equal(dashboard.routeFinished, true);
  assert.equal(dashboard.nextMaterialId, null);
  assert.equal(await getNextMaterialAfter(lead.id, decision), null);
  revisitMaterialIds = [decision.id];
  await post("Помоги ещё раз применить изученное", 832);
  assert.ok(lastMessage().text.includes("Уже изучено"));
  assert.ok(lastMessage().reply_markup.inline_keyboard.flat().some(b => b.text.startsWith("↩ Практика")));
  goal = "Задача, для которой в каталоге ничего нет"; routeAction = "replace"; revisitMaterialIds = [];
  await post("Теперь у меня другая задача", 832);
  dashboard = await getJourneyDashboard(lead.id, "https://neiro.test");
  assert.equal(dashboard.track.length, 0);
  assert.equal(dashboard.nextMaterialId, null);
  process.env.LIBRARY_FOLLOWUPS_ENABLED = "true";
  assert.equal(await scheduleNextStepFollowup(lead.id), false);
});

test("long Telegram replies leave buttons on the final message and escape catalogue HTML", async () => {
  const { sendTextMessages } = await import("../lib/telegram.ts");
  const { formatMaterialCard } = await import("../lib/library/presentation.ts");
  await sendTextMessages(1, "Абзац с текстом.\n\n".repeat(500), { inline_keyboard: [[{ text: "Меню", callback_data: "nav:menu" }]] });
  const messages = calls.filter(c => c.method === "sendMessage");
  assert.ok(messages.length > 1);
  assert.ok(!messages[0].reply_markup);
  assert.equal(messages.at(-1).reply_markup.inline_keyboard[0][0].callback_data, "nav:menu");
  const html = convertMarkdownToTelegramHtml(formatMaterialCard({ ...decision, title: "<script> & тест" }, { detailed: true }));
  assert.ok(html.includes("&lt;script&gt; &amp; тест"));
  assert.ok(html.includes("<b>С чего начать</b>"));
});

test("malformed model JSON preserves the saved route and a working continuation button", async () => {
  await post("/start", 833);
  const lead = await storage.getLeadByTelegramUserId(833);
  await storage.upsertUserLibraryProfile(lead.id, { journey_goal: "Выбрать работу", recommended_material_ids: [decision.id] });
  rawJourneyReply = '{"reply":"broken';
  await post("Что делать дальше?", 833);
  assert.ok(lastMessage().text.includes("не получилось подготовить ответ"));
  assert.ok(lastMessage().reply_markup.inline_keyboard.flat().some(b => b.callback_data === `lib:mat:${decision.id}`));
  assert.ok(lastMessage().reply_markup.inline_keyboard.flat().some(b => b.callback_data === "nav:menu"));
  assert.deepEqual((await storage.getUserLibraryProfile(lead.id)).recommended_material_ids, [decision.id]);
  assert.equal((await storage.getLibraryProgress(lead.id, [decision.id])).length, 0);
});

test("explicit application help exits pending audit intake so the next practice reply is not saved as an audit request", async () => {
  await post("аудит", 834);
  await post(`lib:help:${decision.id}`, 834, true);
  await post("Выписал факты, что проверить дальше?", 834);
  const lead = await storage.getLeadByTelegramUserId(834);
  assert.equal(lead.current_stage, "ecosystem_menu");
  assert.ok(!lead.audit_request);
  assert.ok(prompts.at(-1).includes("DATA CATALOG"));
});

test("menu command returns from audit to main navigation without treating it as CRM request or resetting progress", async () => {
  await post("/start", 835);
  const lead = await storage.getLeadByTelegramUserId(835);
  await markMaterialCompleted(lead.id, decision);
  await post("аудит", 835);
  prompts.length = 0;
  await post("/menu@JourneyBot", 835);
  assert.equal((await storage.getLeadById(lead.id)).current_stage, "ecosystem_menu");
  assert.ok(!(await storage.getLeadById(lead.id)).audit_request);
  assert.equal((await storage.getLibraryProgress(lead.id, [decision.id]))[0].status, "completed");
  assert.equal(prompts.length, 0);
  assert.ok(lastMessage().reply_markup.inline_keyboard.flat().some(b => b.callback_data === "lib:cat:life"));
  assert.ok(lastMessage().reply_markup.inline_keyboard.flat().some(b => b.web_app?.url.endsWith("/journey")));
});
