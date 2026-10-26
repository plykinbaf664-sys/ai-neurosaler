import "./register-typescript.mjs";
import assert from "node:assert/strict";
import { test, beforeEach, after } from "node:test";
import { execFileSync } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import { createHash } from "node:crypto";

Object.assign(process.env, { STORAGE_DRIVER: "local", LOCAL_DATA_MODE: "memory", AI_MAP_ENABLED: "true",
  LIBRARY_ENABLED: "true", LIBRARY_FOLLOWUPS_ENABLED: "false", TELEGRAM_BOT_TOKEN: "map-test",
  TELEGRAM_WEBHOOK_SECRET: "map-secret", TELEGRAM_ADMIN_USER_ID: "99999", ADMIN_TELEGRAM_ID: "77777",
  LIBRARY_LINK_SECRET: "map-library-secret-24-characters-long", AI_PROVIDER: "qwen", QWEN_API_KEY: "fake",
  QWEN_MODEL: "qwen-plus", QWEN_BASE_URL: "https://qwen.test/v1" });
const storage = await import("../lib/storage/index.ts");
const { POST } = await import("../app/api/telegram/webhook/route.ts");
const { GET: cron } = await import("../app/api/cron/library-followups/route.ts");
const { buildAiMapResult } = await import("../lib/neiroclozer/ai-map.ts");
const { sendDueAiMapFollowups } = await import("../lib/neiroclozer/ai-map-followups.ts");
const { sendGeneratedVisual, buildVisualPrompt } = await import("../lib/neiroclozer/visuals.ts");
const { isMapRefusal } = await import("../lib/neiroclozer/ai-map-telegram.ts");
const { buildMarketingRoiQuizVerdict, MARKETING_ROI_QUIZ_QUESTIONS } = await import("../lib/neiroclozer/marketing-roi-quiz.ts");
const { supabaseStorageAdapter } = await import("../lib/storage/supabase.ts");
const originalFetch = globalThis.fetch;
const calls = [];
const completedLeadIds = new Set();
let seq = 1000, nextUser = 10000;
let failVideo = false, failImage = false, failPhoto = false, blocked = false;
globalThis.fetch = async (url, init = {}) => {
  const endpoint = String(url);
  if (endpoint === "https://api.openai.com/v1/images/generations") {
    calls.push({ method: "generateImage", authorization: init.headers.Authorization, ...JSON.parse(init.body) });
    return failImage ? Response.json({ error: "unavailable" }, { status: 503 }) : Response.json({ data: [{ b64_json: Buffer.from("fake-png").toString("base64") }] });
  }
  if (endpoint === "https://qwen.test/v1/chat/completions") {
    calls.push({ method: "qwen", ...JSON.parse(init.body) });
    return Response.json({ choices: [{ message: { content: "Какой процесс из карты хочешь разобрать?" }, finish_reason: "stop" }] });
  }
  assert.ok(endpoint.startsWith("https://api.telegram.org/botmap-test/"), `Unexpected network request: ${endpoint}`);
  const method = endpoint.split("/").at(-1);
  const body = init.body instanceof FormData ? Object.fromEntries(init.body.entries()) : init.body ? JSON.parse(init.body) : {};
  calls.push({ method, ...body });
  if ((method === "sendVideoNote" && failVideo) || (method === "sendPhoto" && failPhoto)) return Response.json({ ok: false, description: "bad media" }, { status: 400 });
  if (method === "sendMessage" && blocked) return Response.json({ ok: false, description: "bot was blocked" }, { status: 403 });
  return Response.json({ ok: true, result: { message_id: ++seq, text: body.text, username: "MapTestBot", photo: [{ file_id: "photo-cached" }] } });
};
beforeEach(async () => {
  for (const id of completedLeadIds) await storage.stopAiMapFollowups(id);
  calls.length = 0; failVideo = failImage = failPhoto = blocked = false;
  delete process.env.OPENAI_API_KEY;
  Object.assign(process.env, { AI_MAP_ENABLED: "true", LIBRARY_ENABLED: "true", WELCOME_VIDEO_ENABLED: "false",
    IMAGE_GENERATION_ENABLED: "false", QUIZ_FOLLOWUPS_ENABLED: "false", LIBRARY_FOLLOWUPS_ENABLED: "false",
    WELCOME_VIDEO_NOTE_FILE_ID: "", ADMIN_TELEGRAM_ID: "77777", IMAGE_PROVIDER: "openai", IMAGE_MODEL: "gpt-image-1.5", IMAGE_API_KEY: "fake-image-key" });
});
after(() => { globalThis.fetch = originalFetch; });

async function post(text, user, callback = false, media = {}) {
  const from = { id: user, first_name: "Test" };
  const message = { message_id: ++seq, from, chat: { id: user, type: "private" }, ...(text ? { text } : {}), ...media };
  const update = callback ? { callback_query: { id: `cb-${seq}`, from, message, data: text } } : { message };
  const response = await POST(new Request("https://map.test/api/telegram/webhook", { method: "POST",
    headers: { "x-telegram-bot-api-secret-token": "map-secret" }, body: JSON.stringify(update) }));
  assert.equal(response.status, 200, await response.clone().text());
  return response.json();
}
const messages = () => calls.filter(c => c.method === "sendMessage");
const buttons = () => messages().at(-1)?.reply_markup?.inline_keyboard.flat() ?? [];
async function complete(keys = ["services", "sales", "team", "sales", "sales"]) {
  const user = ++nextUser;
  await post("/start", user);
  await post("ai:map", user, true);
  const lead = await storage.getLeadByTelegramUserId(user);
  for (const key of keys) {
    const state = (await storage.getUserLibraryProfile(lead.id)).ai_map;
    await post(`ai:a:${state.version}:${key}`, user, true);
  }
  completedLeadIds.add(lead.id);
  return { user, lead, state: structuredClone((await storage.getUserLibraryProfile(lead.id)).ai_map) };
}

test("new start has one primary AI-map CTA and both direct categories, with video before onboarding", async () => {
  process.env.WELCOME_VIDEO_ENABLED = "true"; process.env.WELCOME_VIDEO_NOTE_FILE_ID = "welcome-circle";
  await post("/start", ++nextUser);
  assert.equal(calls[0].method, "sendVideoNote");
  assert.equal(calls[0].video_note, "welcome-circle");
  assert.match(messages().at(-1).text, /7 минут/);
  assert.match(messages().at(-1).text, /AI-карт/);
  assert.deepEqual(buttons().map(b => b.text), ["🔥 Получить AI-карту бизнеса", "🧠 AI для жизни", "🚀 AI для бизнеса"]);
  const lead = await storage.getLeadByTelegramUserId(nextUser);
  assert.ok((await storage.getRecentUserEvents(lead.id)).some(e => e.event_name === "welcome_video_sent"));
});

test("missing video and Telegram video errors both leave onboarding available", async () => {
  process.env.WELCOME_VIDEO_ENABLED = "true";
  await post("/start", ++nextUser);
  assert.equal(calls.some(c => c.method === "sendVideoNote"), false);
  process.env.WELCOME_VIDEO_NOTE_FILE_ID = "bad-circle"; failVideo = true;
  await post("/start", ++nextUser);
  assert.ok(buttons().some(b => b.callback_data === "ai:map"));
});

test("admin media is captured before expert/lead routing; nonadmin media cannot expose IDs", async () => {
  await post("", 77777, false, { video_note: { file_id: "admin-circle" } });
  assert.equal(messages().at(-1).text, "🎬 VIDEO_NOTE_FILE_ID\n\nadmin-circle");
  assert.equal(await storage.getLeadByTelegramUserId(77777), null);
  await post("", 77777, false, { photo: [{ file_id: "small" }, { file_id: "large" }] });
  assert.equal(messages().at(-1).text, "🖼 PHOTO_FILE_ID\n\nlarge");
  calls.length = 0;
  const result = await post("", ++nextUser, false, { video_note: { file_id: "private-circle" } });
  assert.equal(result.ignored, true); assert.equal(calls.length, 0);
});

test("media capture reuses the existing admin ID unless a separate media admin is configured", async () => {
  process.env.ADMIN_TELEGRAM_ID = "  ";
  await post("", 99999, false, { video_note: { file_id: "existing-admin-circle" } });
  assert.equal(messages().at(-1).text, "🎬 VIDEO_NOTE_FILE_ID\n\nexisting-admin-circle");
  process.env.ADMIN_TELEGRAM_ID = "77777";
  calls.length = 0;
  const result = await post("", 99999, false, { video_note: { file_id: "not-media-admin" } });
  assert.equal(result.ignored, true);
  assert.equal(calls.length, 0);
});

test("all five answers persist; result has three processes, priority, evidence, independent test and real material buttons", async () => {
  const { lead, state } = await complete();
  assert.equal(state.answers.length, 5);
  assert.equal(state.result.processKeys.length, 3);
  assert.equal(state.result.processKeys[0], "sales");
  assert.ok(state.resultShownAt);
  assert.match(state.result.text, /Что можно сделать сегодня/);
  assert.match(state.result.text, /Если делать только одну вещь/);
  assert.match(state.result.text, /Заявки есть, но часть куда-то пропадает/);
  assert.match(state.result.text, /20 последних переписок/);
  assert.doesNotMatch(state.result.text, /Критическая|%|экономия.*руб/);
  for (const id of state.result.materialIds) assert.ok((await storage.getLibraryMaterialById(id)).is_active);
  assert.deepEqual((await storage.getUserLibraryProfile(lead.id)).recommended_material_ids, state.result.materialIds);
  assert.ok(messages().some(m => m.reply_markup?.inline_keyboard.flat().some(b => b.callback_data?.startsWith("ai:m:"))));
  assert.equal((await storage.getLeadById(lead.id)).status, "active");
  const events = await storage.getRecentUserEvents(lead.id);
  for (const name of ["ai_map_started", "ai_map_completed", "ai_map_result_shown"]) assert.equal(events.filter(e => e.event_name === name).length, 1);
});

test("priority responds to answers; missing evidence is labelled; removed materials are never invented", async () => {
  const catalog = await storage.getActiveLibraryMaterials();
  for (const key of ["sales", "team", "reports", "documents", "content", "support"]) {
    const result = buildAiMapResult(["b2b", key, key, key, key], catalog);
    assert.equal(result.processKeys[0], key);
    assert.match(result.text, /гипотеза для проверки/);
  }
  const unknown = buildAiMapResult(["expert", "unknown", "unknown", "unknown", "unknown"], []);
  assert.equal(unknown.materialIds.length, 0);
  assert.match(unknown.text, /не диагноз/);
  assert.throws(() => buildAiMapResult(["services", "bogus"], catalog));
});

test("map entry preserves existing handoff and refusal detection does not mistake a business goal for opt-out", async () => {
  const user = ++nextUser;
  await post("/start", user);
  const lead = await storage.getLeadByTelegramUserId(user);
  await storage.updateLeadById(lead.id, { currentStage: "handoff", status: "needs_manual_followup", matchedOffer: "existing" });
  await post("ai:map", user, true);
  assert.equal((await storage.getLeadById(lead.id)).current_stage, "handoff");
  assert.equal((await storage.getLeadById(lead.id)).matched_offer, "existing");
  assert.equal((await storage.getUserLibraryProfile(lead.id)).ai_map.stopped, true);
  for (const text of ["не пишите мне больше", "пока не хочу", "не интересует", "спасибо, пока не нужно"]) assert.equal(isMapRefusal(text), true);
  assert.equal(isMapRefusal("не хочу терять заявки"), false);
});

test("stale or concurrent answer callbacks cannot advance twice", async () => {
  const user = ++nextUser;
  await post("/start ai_map", user);
  const lead = await storage.getLeadByTelegramUserId(user);
  const state = (await storage.getUserLibraryProfile(lead.id)).ai_map;
  const action = `ai:a:${state.version}:services`;
  await Promise.all([post(action, user, true), post(action, user, true)]);
  await post(action, user, true);
  assert.equal((await storage.getUserLibraryProfile(lead.id)).ai_map.answers.length, 1);
  assert.ok(buttons().filter(b => b.callback_data?.startsWith("ai:a:")).every(b => Buffer.byteLength(b.callback_data) <= 64));
});

test("saved map reopens without rescheduling or repeating completion; off-topic dialogue preserves pending question", async () => {
  const { user, lead, state } = await complete();
  const due = (await storage.getUserLibraryProfile(lead.id)).ai_map_followup_due_at;
  await post("ai:map", user, true);
  assert.equal((await storage.getUserLibraryProfile(lead.id)).ai_map_followup_due_at, due);
  assert.equal((await storage.getUserLibraryProfile(lead.id)).ai_map.version, state.version);
  const another = ++nextUser;
  await post("/start ai_map", another);
  const otherLead = await storage.getLeadByTelegramUserId(another);
  await post("Объясни, зачем это нужно", another);
  assert.equal((await storage.getUserLibraryProfile(otherLead.id)).ai_map.answers.length, 0);
  assert.ok(buttons().some(b => b.callback_data?.startsWith("ai:a:")));
});

test("both libraries and existing ball payload work directly; recommendations use existing library opening without completion", async () => {
  const { user, lead, state } = await complete();
  await post(`ai:m:${state.result.materialIds[0]}`, user, true);
  assert.ok(buttons().some(b => b.text === "Открыть материал"));
  assert.equal((await storage.getLibraryProgress(lead.id, state.result.materialIds))[0].status, "opened");
  assert.deepEqual((await storage.getUserLibraryProfile(lead.id)).recommended_material_ids, state.result.materialIds);
  assert.ok((await storage.getRecentUserEvents(lead.id)).some(e => e.event_name === "ai_map_material_clicked" && e.metadata.material_slug));
  for (const category of ["life", "business"]) {
    await post("/start", user); await post(`lib:cat:${category}`, user, true);
    assert.ok(messages().at(-1).reply_markup.inline_keyboard.length > 0);
  }
  const ballUser = ++nextUser;
  await post("/start ball", ballUser);
  assert.ok(buttons().some(b => b.callback_data?.includes("spin")));
  const ballLead = await storage.getLeadByTelegramUserId(ballUser);
  assert.equal((await storage.getLibraryProgress(ballLead.id, state.result.materialIds)).length, 0);
});

test("map flag off keeps legacy marketing path and stale map button falls back safely", async () => {
  process.env.AI_MAP_ENABLED = "false";
  const user = ++nextUser;
  await post("/start", user);
  assert.ok(buttons().some(b => b.callback_data === "nav:marketing"));
  await post("ai:map", user, true);
  assert.ok(buttons().some(b => b.callback_data === "nav:marketing"));
  await post("nav:marketing", user, true);
  assert.equal((await storage.getLeadByTelegramUserId(user)).current_stage, "marketing_roi_quiz_q1");
  const keys = ["A", "B", "C", "D"];
  const expected = ["Критическая", "Частичная", "Маркетинг работает"];
  for (const a of keys) for (const b of keys) for (const c of keys) {
    const score = [a, b, c].reduce((sum, key) => sum + keys.indexOf(key), 0);
    assert.ok(buildMarketingRoiQuizVerdict([a, b, c]).startsWith(expected[score <= 2 ? 0 : score <= 5 ? 1 : 2]));
  }
  for (const q of MARKETING_ROI_QUIZ_QUESTIONS) assert.deepEqual(q.options.map(o => o.score), [0, 1, 2, 3]);
});

test("four followups run at 1/3/24/48h and overlapping calls or module reload cannot duplicate them", async () => {
  const { lead, state } = await complete(); process.env.QUIZ_FOLLOWUPS_ENABLED = "true";
  const start = Date.parse(state.resultShownAt);
  assert.equal((await sendDueAiMapFollowups(new Date(start + 3_599_000))).sent, 0);
  for (const hour of [1, 3, 24, 48]) {
    const at = new Date(start + hour * 3_600_000 + 1);
    const outputs = await Promise.all([sendDueAiMapFollowups(at), sendDueAiMapFollowups(at)]);
    assert.equal(outputs.reduce((sum, r) => sum + r.sent, 0), 1);
    const reloaded = await import(`../lib/neiroclozer/ai-map-followups.ts?restart=${hour}`);
    assert.equal((await reloaded.sendDueAiMapFollowups(at)).sent, 0);
  }
  const profile = await storage.getUserLibraryProfile(lead.id);
  assert.equal(profile.ai_map.followupStep, 4); assert.equal(profile.ai_map_followup_due_at, null);
  assert.deepEqual((await storage.getRecentUserEvents(lead.id)).filter(e => e.event_name === "ai_map_followup_sent").map(e => e.metadata.step).sort(), [1, 2, 3, 4]);
  assert.equal((await sendDueAiMapFollowups(new Date(start + 100 * 3_600_000))).sent, 0);
});

test("late scheduler skips old steps instead of sending a burst", async () => {
  const { lead, state } = await complete(); process.env.QUIZ_FOLLOWUPS_ENABLED = "true";
  const output = await sendDueAiMapFollowups(new Date(Date.parse(state.resultShownAt) + 49 * 3_600_000));
  assert.ok(output.sent >= 1);
  assert.equal((await storage.getUserLibraryProfile(lead.id)).ai_map.followupStep, 4);
  assert.equal(messages().filter(m => m.chat_id === lead.telegram_chat_id && m.text.includes("последнее автоматическое")).length, 1);
});

test("process CTA enters existing intake, stops followups, saves request and calendar without conversion", async () => {
  const { user, lead, state } = await complete();
  await post("ai:audit", user, true);
  assert.equal((await storage.getLeadById(lead.id)).current_stage, "audit_request_requested");
  assert.equal((await storage.getUserLibraryProfile(lead.id)).ai_map.stopped, true);
  await post("Хочу собрать обработку входящих заявок без ручного копирования", user);
  const updated = await storage.getLeadById(lead.id);
  assert.equal(updated.current_stage, "handoff"); assert.equal(updated.status, "needs_manual_followup");
  assert.ok(updated.audit_request); assert.ok(buttons().some(b => b.url?.includes("calendar")));
  process.env.QUIZ_FOLLOWUPS_ENABLED = "true";
  const before = messages().filter(m => m.chat_id === user).length;
  await sendDueAiMapFollowups(new Date(Date.parse(state.resultShownAt) + 4 * 3_600_000));
  assert.equal(messages().filter(m => m.chat_id === user).length, before);
});

test("refusal, disabled reminders, lead/converted/handoff states and blocked bots stop the series", async () => {
  for (const kind of ["refusal", "reminders", "qualified", "converted", "handoff", "blocked"]) {
    process.env.QUIZ_FOLLOWUPS_ENABLED = "false";
    const { user, lead, state } = await complete();
    if (kind === "refusal") await post("не хочу", user);
    if (kind === "reminders") await post("lib:reminders:off", user, true);
    if (["qualified", "converted"].includes(kind)) await storage.updateLeadById(lead.id, { status: kind });
    if (kind === "handoff") await storage.updateLeadById(lead.id, { currentStage: "handoff" });
    if (kind === "blocked") blocked = true;
    process.env.QUIZ_FOLLOWUPS_ENABLED = "true";
    await sendDueAiMapFollowups(new Date(Date.parse(state.resultShownAt) + 2 * 3_600_000));
    blocked = false;
    assert.equal((await storage.getUserLibraryProfile(lead.id)).ai_map.stopped, true, kind);
    assert.equal((await storage.getUserLibraryProfile(lead.id)).ai_map_followup_due_at, null, kind);
    await storage.stopAiMapFollowups(lead.id);
  }
});

test("generation caches Telegram asset persistently and coalesces concurrent generation", async () => {
  process.env.IMAGE_GENERATION_ENABLED = "true";
  const screen = { screenKey: "test-cache", type: "category", title: "AI для бизнеса", description: "Рабочие процессы", category: "business" };
  const lead = (await complete()).lead;
  calls.length = 0;
  await Promise.all([sendGeneratedVisual(lead.telegram_chat_id, lead.id, screen), sendGeneratedVisual(lead.telegram_chat_id, lead.id, screen)]);
  assert.equal(calls.filter(c => c.method === "generateImage").length, 1);
  await sendGeneratedVisual(lead.telegram_chat_id, lead.id, screen);
  assert.equal(calls.filter(c => c.method === "generateImage").length, 1);
  assert.equal(calls.filter(c => c.method === "sendPhoto").at(-1).photo, "photo-cached");
  // Ready screens are reused even after generator settings are changed or removed.
  process.env.IMAGE_MODEL = "different-model";
  process.env.IMAGE_PROVIDER = "different-provider";
  delete process.env.IMAGE_API_KEY;
  await sendGeneratedVisual(lead.telegram_chat_id, lead.id, screen);
  delete process.env.IMAGE_MODEL;
  delete process.env.IMAGE_PROVIDER;
  await sendGeneratedVisual(lead.telegram_chat_id, lead.id, screen);
  assert.equal(calls.filter(c => c.method === "generateImage").length, 1);
  assert.equal(calls.filter(c => c.method === "sendPhoto").length, 4);
  assert.match(buildVisualPrompt({ ...screen, category: "life" }), /Warm natural light/);
  assert.match(buildVisualPrompt(screen), /Business editorial/);
});

test("images reuse OPENAI_API_KEY and a dedicated IMAGE_API_KEY takes priority without changing cache", async () => {
  const lead = (await complete()).lead;
  process.env.IMAGE_GENERATION_ENABLED = "true";
  process.env.IMAGE_API_KEY = "  ";
  process.env.OPENAI_API_KEY = "existing-openai-key";
  const screen = { screenKey: "shared-key-screen", type: "category", title: "Business", description: "Reuse existing credentials" };
  calls.length = 0;
  await sendGeneratedVisual(lead.telegram_chat_id, lead.id, screen);
  assert.equal(calls.find(c => c.method === "generateImage").authorization, "Bearer existing-openai-key");
  process.env.IMAGE_API_KEY = "dedicated-image-key";
  await sendGeneratedVisual(lead.telegram_chat_id, lead.id, screen);
  assert.equal(calls.filter(c => c.method === "generateImage").length, 1);
  await sendGeneratedVisual(lead.telegram_chat_id, lead.id, { ...screen, screenKey: "dedicated-key-screen" });
  assert.equal(calls.filter(c => c.method === "generateImage").at(-1).authorization, "Bearer dedicated-image-key");
});

test("image provider or Telegram upload failure leaves text flow available; no repeated immediate generation", async () => {
  process.env.IMAGE_GENERATION_ENABLED = "true";
  failImage = true;
  const user = ++nextUser;
  await post("/start", user);
  assert.ok(buttons().some(b => b.callback_data === "ai:map"));
  calls.length = 0;
  await post("lib:cat:life", user, true);
  await post("lib:cat:life", user, true);
  assert.equal(calls.filter(c => c.method === "generateImage").length, 1);
  assert.ok(buttons().some(b => b.callback_data === "nav:menu"));
  failImage = false; failPhoto = true;
  await post("lib:cat:business", user, true);
  assert.ok(buttons().some(b => b.callback_data === "nav:menu"));
  assert.equal(calls.filter(c => c.method === "generateImage").length, 2);
});

test("legacy model-dependent assets are adopted into the stable cache without generation", async () => {
  process.env.IMAGE_GENERATION_ENABLED = "true";
  const lead = (await complete()).lead;
  const screen = { screenKey: "legacy-screen", type: "category", title: "Business", description: "Existing asset" };
  const hash = createHash("sha256").update([process.env.TELEGRAM_BOT_TOKEN, process.env.IMAGE_PROVIDER, process.env.IMAGE_MODEL, "v1"].join(":")).digest("hex").slice(0, 16);
  const legacyKey = `${screen.screenKey}:${hash}`;
  await storage.claimVisualAsset(legacyKey, "legacy-owner", "2026-01-01T00:00:00Z", "2026-01-01T00:05:00Z");
  await storage.finishVisualAsset(legacyKey, "legacy-owner", "legacy-photo", "2026-01-01T00:00:00Z");
  calls.length = 0;
  await sendGeneratedVisual(lead.telegram_chat_id, lead.id, screen);
  delete process.env.IMAGE_API_KEY; delete process.env.IMAGE_MODEL; delete process.env.IMAGE_PROVIDER;
  await sendGeneratedVisual(lead.telegram_chat_id, lead.id, screen);
  assert.equal(calls.filter(c => c.method === "generateImage").length, 0);
  assert.deepEqual(calls.filter(c => c.method === "sendPhoto").map(c => c.photo), ["legacy-photo", "legacy-photo"]);
});

test("existing cron remains authenticated and dispatches AI-map followups independently of library reminders flag", async () => {
  process.env.CRON_SECRET = "cron-test";
  assert.equal((await cron(new Request("https://map.test/api/cron/library-followups"))).status, 401);
  const result = await cron(new Request("https://map.test/api/cron/library-followups", { headers: { Authorization: "Bearer cron-test" } }));
  assert.equal(result.status, 200); assert.equal((await result.json()).aiMap.disabled, true);
});

test("Supabase adapter uses the same bounded state, CAS and lease RPC contracts", async () => {
  const saved = globalThis.fetch;
  const requests = [];
  process.env.SUPABASE_URL = "https://db.test"; process.env.SUPABASE_SERVICE_ROLE_KEY = "fake-db-key";
  globalThis.fetch = async (url, init) => {
    requests.push({ url: String(url), body: init.body ? JSON.parse(init.body) : null });
    return Response.json(String(url).includes("rpc/") ? true : []);
  };
  try {
    const state = { version: "v1", answers: [], followupStep: 0, stopped: false };
    assert.equal(await supabaseStorageAdapter.saveAiMap("u", null, state, null), true);
    assert.equal(requests.at(-1).body.p_expected_version, null);
    assert.equal(await supabaseStorageAdapter.claimAiMapFollowup("u", "v1", 1, "now", "next"), true);
    assert.equal(requests.at(-1).body.p_step, 1);
    await supabaseStorageAdapter.getDueAiMapProfiles("now");
    assert.ok(requests.at(-1).url.includes("ai_map_followup_due_at"));
    await supabaseStorageAdapter.claimVisualAsset("key", "token", "now", "later");
    assert.equal(requests.at(-1).body.p_token, "token");
    await supabaseStorageAdapter.finishVisualAsset("key", "token", "file", "later");
    assert.equal(requests.at(-1).body.file_id, "file");
    process.env.AI_MAP_ENABLED = "false";
    await supabaseStorageAdapter.getUserLibraryProfile("u");
    assert.ok(!new URL(requests.at(-1).url).searchParams.get("select").includes("ai_map"));
  } finally { globalThis.fetch = saved; }
});

test("fresh processes reuse saved map, followup claim and visual file_id from local file storage", async () => {
  const folder = await mkdtemp(path.join(tmpdir(), "neiro-map-test-"));
  const loader = new URL("./register-typescript.mjs", import.meta.url).href;
  const moduleUrl = new URL("../lib/storage/index.ts", import.meta.url).href;
  const code = `
    const s = await import(${JSON.stringify(moduleUrl)});
    let lead = await s.getLeadByTelegramUserId(45678);
    if (!lead) {
      lead = await s.createLead({expertProfileId:null,telegramUserId:45678,telegramChatId:45678,telegramUsername:null,firstName:null,lastName:null,source:'test',status:'active',currentStage:'ai_map_result',matchedOffer:null,lastUserMessage:null,warmthLevel:'cold'});
      await s.recordUserActivity(lead.id);
      await s.saveAiMap(lead.id,null,{version:'persisted',answers:['services','sales','team','sales','sales'],result:{text:'Saved map',processKeys:['sales','team','reports'],materialIds:[]},resultShownAt:'2026-01-01T00:00:00Z',followupStep:0,stopped:false},'2026-01-01T01:00:00Z');
      await s.claimVisualAsset('test-screen','owner','2026-01-01T00:00:00Z','2026-01-01T00:05:00Z');
      await s.finishVisualAsset('test-screen','owner','persistent-file-id','2026-01-01T00:00:00Z');
    }
    const claimed = await s.claimAiMapFollowup(lead.id,'persisted',1,'2026-01-01T01:00:00Z','2026-01-01T03:00:00Z');
    console.log(JSON.stringify({claimed,map:(await s.getUserLibraryProfile(lead.id)).ai_map.result.text,file:(await s.getVisualAsset('test-screen')).file_id}));
  `;
  try {
    const run = () => JSON.parse(execFileSync(process.execPath, ["--import", loader, "--input-type=module", "-e", code], {
      cwd: folder, env: { ...process.env, STORAGE_DRIVER: "local", LOCAL_DATA_MODE: "file" }, encoding: "utf8",
    }));
    assert.deepEqual(run(), { claimed: true, map: "Saved map", file: "persistent-file-id" });
    assert.deepEqual(run(), { claimed: false, map: "Saved map", file: "persistent-file-id" });
  } finally {
    assert.ok(path.resolve(folder).startsWith(path.join(path.resolve(tmpdir()), "neiro-map-test-")));
    await rm(folder, { recursive: true, force: true });
  }
});
