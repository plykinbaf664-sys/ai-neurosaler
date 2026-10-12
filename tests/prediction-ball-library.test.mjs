import "./register-typescript.mjs";
import assert from "node:assert/strict";
import { test, beforeEach, after } from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";

process.env.STORAGE_DRIVER = "local";
process.env.LOCAL_DATA_MODE = "memory";
process.env.LIBRARY_ENABLED = "true";
process.env.LIBRARY_FOLLOWUPS_ENABLED = "false";
process.env.LIBRARY_LINK_SECRET = "test-library-secret-at-least-24-characters";
process.env.TELEGRAM_BOT_TOKEN = "test-token";
const storage = await import("../lib/storage/index.ts");
const { handleLibraryTelegramAction } = await import("../lib/library/telegram.ts");
const { getCategoryProgress } = await import("../lib/library/progress.ts");
const { GET: openMaterial } = await import("../app/api/library/open/route.ts");
const { BALL_RESULTS, BALL_COOLDOWN_TEXT, isPredictionBallAction } = await import("../lib/prediction-ball.ts");
const { editTextMessage } = await import("../lib/telegram.ts");
const expertProfile = await storage.getActiveExpertProfile();
const calls = [];
const originalFetch = globalThis.fetch;
let editFailure = null;
let allowAi = false;
globalThis.fetch = async (url, init) => {
  if (allowAi && String(url) === "https://api.anthropic.com/v1/messages") {
    calls.push({ method: "mockAi" });
    return Response.json({ content: [{ type: "text", text: "Проверочный ответ AI." }] });
  }
  assert.ok(String(url).startsWith("https://api.telegram.org/bottest-token/"), `Unexpected network/AI call: ${url}`);
  const method = String(url).split("/").at(-1);
  const body = init?.body ? JSON.parse(init.body) : {};
  calls.push({ method, ...body, at: Date.now() });
  if (method === "getMe") return Response.json({ ok: true, result: { username: "TestNeiroBot" } });
  if (method === "editMessageText" && editFailure) {
    const fail = editFailure;
    editFailure = null;
    return Response.json(fail.body, { status: fail.status });
  }
  return Response.json({ ok: true, result: { message_id: body.message_id ?? 500, text: body.text } });
};
after(() => { globalThis.fetch = originalFetch; });
beforeEach(() => { calls.length = 0; editFailure = null; allowAi = false; process.env.LIBRARY_ENABLED = "true"; });

async function action(text, telegramUserId = 701, callback = !text.startsWith("/")) {
  return handleLibraryTelegramAction({
    message: {
      telegramUserId, telegramChatId: telegramUserId, telegramUsername: null,
      firstName: "Test", lastName: null, text, telegramMessageId: 500,
      ...(callback ? { callbackQueryId: `callback-${telegramUserId}` } : {}),
    },
    expertProfile,
    existingLead: await storage.getLeadByTelegramUserId(telegramUserId),
    publicBaseUrl: "https://neiro.test",
  });
}
const lastMessage = () => calls.filter(c => c.method === "sendMessage" || c.method === "editMessageText").at(-1);
const buttons = () => lastMessage().reply_markup.inline_keyboard.flat();
const events = (lead) => storage.getRecentUserEvents(lead.id, 200);

for (const [category, topic, title, url, description] of [
  ["business", "sales_audit", "Возможно, вам не нужны новые лиды",
    "https://telegra.ph/Vozmozhno-vam-ne-nuzhny-novye-lidy-10-12",
    "Загрузите потерянные переписки и найдите повторяющиеся утечки продаж: забытые follow-up, сделки без следующего шага, слабую диагностику и клиентов, которых ещё можно вернуть."],
  ["life", "decision_making", "Не можешь принять решение? Вот проверенный способ",
    "https://telegra.ph/Ne-mozhesh-prinyat-reshenie-Vot-proverennyj-sposob-10-12",
    "Разберите сложное решение за 15 минут: отделите факты от страхов и предположений, найдите главный компромисс и поймите, что проверить перед выбором."],
]) {
  test(`${category}: appended material, URL, dynamic progress, completion, next and reward`, async () => {
    const materials = await storage.getActiveLibraryMaterials(category);
    const material = materials.at(-1);
    assert.equal(material.title, title);
    assert.equal(material.topic, topic);
    assert.equal(material.url, url);
    assert.equal(material.short_description, description);
    assert.equal(materials.filter(m => m.slug === material.slug).length, 1);
    const { lead } = await action(`lib:cat:${category}`);
    assert.ok(buttons().some(b => b.callback_data === `lib:mat:${material.id}`));
    await action(`lib:mat:${material.id}`);
    assert.ok(lastMessage().text.includes(description));
    const response = await openMaterial(new Request(buttons().find(b => b.url).url));
    assert.equal(response.status, 303);
    assert.equal(response.headers.get("location"), url);
    await action(`lib:done:${material.id}`);
    await action(`lib:done:${material.id}`);
    const progress = await getCategoryProgress(lead.id, category);
    assert.equal(progress.total, materials.length);
    assert.equal(progress.completed, 1);
    assert.equal((await events(lead)).filter(e => e.event_name === "material_completed" && e.material_id === material.id).length, 1);
    assert.ok(lastMessage().text.includes(`Изучено 1 из ${materials.length}`));
    await action(`lib:mat:${material.id}`);
    assert.equal((await getCategoryProgress(lead.id, category)).completed, 1);
    await action(`lib:next:${materials[0].id}`);
    assert.ok(lastMessage().text.includes(materials[1].title));
    for (const item of materials) await action(`lib:done:${item.id}`);
    await action(`lib:done:${material.id}`);
    assert.equal((await events(lead)).filter(e => e.event_name === "reward_unlocked" && e.category === category).length, 1);
    await action(`lib:all:${category}`);
    assert.ok(lastMessage().text.includes(`Изучено ${materials.length} из ${materials.length}`));
  });
}

test("life has a separate ball button for both new and returning readers; business does not", async () => {
  await action("lib:cat:life", 702);
  assert.equal(buttons()[0].text, "🔮 Шар предсказаний");
  await action("lib:cat:life", 701);
  assert.ok(buttons().some(b => b.callback_data === "ball:open"));
  await action("lib:cat:business", 702);
  assert.ok(buttons().every(b => b.callback_data !== "ball:open"));
  assert.ok((await storage.getActiveLibraryMaterials()).every(m => !/ball|предсказаний/.test(m.slug + m.title)));
});

test("exactly the 13 approved phrases are preserved", () => {
  assert.deepEqual(BALL_RESULTS, ["Не вариант", "Почему бы и да", "А что от этого тебе?", "Даже не думай", "Слабая позиция", "Как нехуй делать", "Нужно купить новые штаны", "Писать сидя удобней для всех", "В этом что-то есть", "Идея на миллион", "Момент истины", "Хуёво тоже результат", "Рискуй"]);
});

test("new-user deep link opens ball immediately, animation edits one message, share contains result and deep link", async () => {
  const { lead, handled } = await action("/start ball", 703);
  assert.equal(handled, true);
  assert.ok(lastMessage().text.startsWith("🔮 Шар предсказаний"));
  assert.equal(buttons()[0].callback_data, "ball:spin");
  const before = await getCategoryProgress(lead.id, "life");
  calls.length = 0;
  await action("ball:spin", 703);
  const edits = calls.filter(c => c.method === "editMessageText");
  assert.equal(edits.length, 3);
  assert.ok(edits.every(c => c.message_id === 500));
  assert.equal(calls.filter(c => c.method === "sendMessage").length, 0);
  assert.ok(edits.at(-1).at - edits[0].at >= 1_900);
  const spin = (await events(lead)).find(e => e.event_name === "prediction_ball_spun");
  assert.ok(BALL_RESULTS.includes(spin.metadata.result));
  assert.equal(spin.material_id, null);
  assert.ok(lastMessage().text.includes(spin.metadata.result));
  const share = new URL(buttons().find(b => b.text === "📤 Поделиться").url);
  assert.equal(share.origin + share.pathname, "https://t.me/share/url");
  assert.equal(share.searchParams.get("url"), "https://t.me/TestNeiroBot?start=ball");
  assert.equal(share.searchParams.get("text"), `🔮 Шар предсказаний сказал мне: «${spin.metadata.result}»\nТеперь твоя очередь: https://t.me/TestNeiroBot?start=ball`);
  assert.deepEqual(await getCategoryProgress(lead.id, "life"), before);
  assert.deepEqual((await events(lead)).map(e => e.event_name).sort(), ["prediction_ball_opened", "prediction_ball_spun"]);
  calls.length = 0;
  await action("ball:spin", 703);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].method, "answerCallbackQuery");
  assert.equal(calls[0].text, BALL_COOLDOWN_TEXT);
  assert.equal(calls[0].show_alert, true);
  assert.equal((await events(lead)).filter(e => e.event_name === "prediction_ball_spun").length, 1);
  await action("lib:cat:life", 703);
  assert.ok(lastMessage().text.includes("Изучено"));
});

test("24-hour boundary, simultaneous spins and per-user isolation", async (t) => {
  const { lead } = await action("/start ball", 704);
  const now = Date.now();
  let clock = now;
  t.mock.method(Date, "now", () => clock);
  const results = await Promise.all(Array.from({ length: 10 }, () => storage.claimPredictionBallSpin(lead.id, "Рискуй")));
  assert.equal(results.filter(Boolean).length, 1);
  clock = now + 86_400_000 - 1;
  assert.equal(await storage.claimPredictionBallSpin(lead.id, "Рискуй"), false);
  clock = now + 86_400_000;
  assert.equal(await storage.claimPredictionBallSpin(lead.id, "Рискуй"), true);
  const another = (await action("/start ball", 705)).lead;
  assert.equal(await storage.claimPredictionBallSpin(another.id, "Рискуй"), true);
});

test("repeat after 24 hours generates another allowed result, including possible repeats", async () => {
  const lead = await storage.getLeadByTelegramUserId(703);
  (await events(lead)).find(e => e.event_name === "prediction_ball_spun").created_at = new Date(Date.now() - 86_400_001).toISOString();
  await action("ball:spin", 703);
  const spins = (await events(lead)).filter(e => e.event_name === "prediction_ball_spun");
  assert.equal(spins.length, 2);
  assert.ok(spins.every(e => BALL_RESULTS.includes(e.metadata.result)));
  assert.ok(lastMessage().text.includes(spins[0].metadata.result));
});

test("plain start, other payloads, marketing entry and old handoff state stay intact", async () => {
  await action("/start", 706);
  assert.deepEqual(buttons().map(b => b.callback_data), ["nav:marketing", "lib:cat:life", "lib:cat:business"]);
  for (const payload of ["ref_123", "gift", "ball_extra"]) {
    assert.equal((await action(`/start ${payload}`, 706)).handled, false);
  }
  assert.equal((await action("nav:marketing", 706)).startMarketing, true);
  const lead = await storage.getLeadByTelegramUserId(706);
  await storage.updateLeadById(lead.id, { currentStage: "handoff", status: "needs_manual_followup", matchedOffer: "existing" });
  await action("/start@TestNeiroBot ball", 706);
  const after = await storage.getLeadById(lead.id);
  assert.equal(after.current_stage, "handoff");
  assert.equal(after.status, "needs_manual_followup");
  assert.equal(after.matched_offer, "existing");
  assert.equal((await action("Обычный вопрос для AI", 706)).handled, false);
  assert.equal(isPredictionBallAction({ text: "ball:spin" }), false);
  process.env.LIBRARY_ENABLED = "false";
  assert.equal((await action("/start", 707)).handled, false);
  assert.equal((await action("/start ball", 707)).handled, true);
  assert.equal(buttons().at(-1).callback_data, "/start");
});

test("optional animation failure still delivers the prediction", async () => {
  await action("/start ball", 708);
  editFailure = { status: 400, body: { ok: false, description: "message can't be edited" } };
  await action("ball:spin", 708);
  assert.ok(lastMessage().text.startsWith("🔮 Шар сказал:"));
});

test("Telegram retry_after is respected and unchanged edits are harmless", async () => {
  editFailure = { status: 429, body: { ok: false, parameters: { retry_after: 1 } } };
  await editTextMessage(709, 500, "🔮 ·");
  assert.equal(calls.length, 2);
  assert.ok(calls[1].at - calls[0].at >= 950);
  editFailure = { status: 400, body: { ok: false, description: "Bad Request: message is not modified" } };
  await editTextMessage(709, 500, "🔮 ·");
});

test("webhook routes ball callbacks once and preserves quiz, AI dialogue and handoff", async () => {
  const { POST } = await import("../app/api/telegram/webhook/route.ts");
  process.env.TELEGRAM_WEBHOOK_SECRET = "test-secret";
  process.env.TELEGRAM_ADMIN_USER_ID = "999999";
  process.env.ANTHROPIC_API_KEY = "test-ai-key";
  process.env.NEIRO_ENTRY_FLOW_MODE = "quiz";
  async function post(text, user = 710, callback = false) {
    const from = { id: user, first_name: "Webhook test" };
    const message = { message_id: 500, from, chat: { id: user, type: "private" }, text };
    const update = callback ? { callback_query: { id: "webhook-callback", from, message, data: text } } : { message };
    const response = await POST(new Request("https://neiro.test/api/telegram/webhook", {
      method: "POST", headers: { "x-telegram-bot-api-secret-token": "test-secret" }, body: JSON.stringify(update),
    }));
    const body = await response.json();
    assert.equal(response.status, 200, JSON.stringify(body));
    return body;
  }
  assert.equal((await post("/start ball")).library, true);
  calls.length = 0;
  await post("ball:spin", 710, true);
  assert.equal(calls.filter(c => c.method === "answerCallbackQuery").length, 1);
  calls.length = 0;
  await post("ball:spin", 710, true);
  assert.equal(calls.filter(c => c.method === "answerCallbackQuery").length, 1);
  assert.equal(calls[0].text, BALL_COOLDOWN_TEXT);
  await post("/start", 711);
  assert.deepEqual(buttons().map(b => b.callback_data), ["nav:marketing", "lib:cat:life", "lib:cat:business"]);
  await post("nav:marketing", 711, true);
  assert.ok(lastMessage().text.includes("1/3"));
  for (const answer of ["A", "B", "C"]) await post(answer, 711, true);
  const lead = await storage.getLeadByTelegramUserId(711);
  assert.equal((await events(lead)).filter(e => e.event_name === "marketing_quiz_answered").length, 3);
  assert.equal((await events(lead)).filter(e => e.event_name === "marketing_quiz_completed").length, 1);
  allowAi = true;
  await post("Как устроена диагностика?", 711);
  assert.ok(calls.some(c => c.method === "mockAi"));
  await post("Дай ссылку на запись", 711);
  const handoffLead = await storage.getLeadByTelegramUserId(711);
  assert.equal(handoffLead.status, "needs_manual_followup");
  const handoffStage = handoffLead.current_stage;
  await post("/start ball", 711);
  assert.equal((await storage.getLeadByTelegramUserId(711)).current_stage, handoffStage);
  process.env.LIBRARY_ENABLED = "false";
  await post("/start", 712);
  assert.ok(lastMessage().text.includes("1/3"));
  await post("/start old_payload", 713);
  assert.ok(lastMessage().text.includes("1/3"));
});

test("local file cooldown survives a fresh process and seed merge does not duplicate materials", async () => {
  const folder = await mkdtemp(path.join(tmpdir(), "neiro-ball-test-"));
  const loader = new URL("./register-typescript.mjs", import.meta.url).href;
  const moduleUrl = new URL("../lib/storage/index.ts", import.meta.url).href;
  const code = `
    const storage = await import(${JSON.stringify(moduleUrl)});
    const allowed = await storage.claimPredictionBallSpin('test-persistent-user', 'Рискуй');
    const materials = await storage.getActiveLibraryMaterials();
    console.log(JSON.stringify({ allowed, slugs: materials.map(m => m.slug) }));
  `;
  try {
    const run = () => JSON.parse(execFileSync(process.execPath, ["--import", loader, "--input-type=module", "-e", code], {
      cwd: folder, env: { ...process.env, LOCAL_DATA_MODE: "file", STORAGE_DRIVER: "local" }, encoding: "utf8",
    }));
    const first = run();
    const second = run();
    assert.equal(first.allowed, true);
    assert.equal(second.allowed, false);
    assert.deepEqual(second.slugs, first.slugs);
    assert.equal(new Set(second.slugs).size, second.slugs.length);
  } finally {
    assert.ok(path.resolve(folder).startsWith(path.join(path.resolve(tmpdir()), "neiro-ball-test-")));
    await rm(folder, { recursive: true, force: true });
  }
});

test("Supabase adapter uses the atomic RPC and fails closed on storage errors", async () => {
  const { supabaseStorageAdapter } = await import("../lib/storage/supabase.ts");
  process.env.SUPABASE_URL = "https://supabase.test";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "test-key";
  const telegramFetch = globalThis.fetch;
  try {
    for (const allowed of [true, false]) {
      globalThis.fetch = async (url, init) => {
        assert.equal(String(url), "https://supabase.test/rest/v1/rpc/claim_prediction_ball_spin");
        assert.equal(init.method, "POST");
        assert.deepEqual(JSON.parse(init.body), { p_user_id: "test-user", p_result: "Рискуй" });
        return Response.json(allowed);
      };
      assert.equal(await supabaseStorageAdapter.claimPredictionBallSpin("test-user", "Рискуй"), allowed);
    }
    globalThis.fetch = async () => Response.json({ message: "unavailable" }, { status: 503 });
    await assert.rejects(supabaseStorageAdapter.claimPredictionBallSpin("test-user", "Рискуй"), /503/);
  } finally {
    globalThis.fetch = telegramFetch;
  }
});
