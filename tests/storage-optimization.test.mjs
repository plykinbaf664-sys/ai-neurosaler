import "./register-typescript.mjs";
import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
const { buildAdminAnalytics, createAdminAnalyticsAccumulator } = await import("../lib/admin-analytics.ts");
const { supabaseStorageAdapter } = await import("../lib/storage/supabase.ts");
const { localStorageAdapter } = await import("../lib/storage/local.ts");
const { handleLibraryTelegramAction } = await import("../lib/library/telegram.ts");

test("paged Supabase analytics preserves all users and clicks beyond 1000 rows", async (t) => {
  process.env.SUPABASE_URL = "https://db.test";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "test-key";
  const date = "2026-10-13T00:00:00Z";
  const leads = Array.from({ length: 1003 }, (_, i) => ({ id: `u${i}`, created_at: date, status: "active", current_stage: "menu", gift_link_clicked_at: null }));
  const events = Array.from({ length: 2007 }, (_, i) => ({ user_id: `u${i % leads.length}`, event_name: "material_presented", category: "life", created_at: date, metadata: { title: "Материал", unused: "x".repeat(1500) } }));
  const requests = [];
  t.mock.method(globalThis, "fetch", async (url) => {
    const parsed = new URL(url);
    requests.push(parsed);
    const isLeads = parsed.pathname.endsWith("/leads");
    const offset = Number(parsed.searchParams.get("offset"));
    const limit = Number(parsed.searchParams.get("limit"));
    assert.equal(limit, 1000);
    const page = (isLeads ? leads : events).slice(offset, offset + limit);
    return Response.json(isLeads ? page : page.map(({ metadata, ...event }) => ({ ...event, title: metadata.title, question: null })));
  });
  const summary = await supabaseStorageAdapter.getAdminAnalytics(0);
  assert.deepEqual(summary, buildAdminAnalytics(leads, events, 0));
  assert.equal(summary.people, 1003);
  assert.equal(summary.materialSelected, 1003);
  assert.equal(summary.clicks.material, 2007);
  assert.equal(requests.length, 5);
  const eventQuery = requests.find(u => u.pathname.endsWith("/user_events"));
  assert.ok(eventQuery.searchParams.get("select").includes("title:metadata->title"));
  assert.ok(!eventQuery.searchParams.get("select").split(",").includes("metadata"));
  assert.ok(!eventQuery.searchParams.get("event_name").includes("prediction_ball"));
});

test("streamed funnel deduplicates every step, handles old-user activity and preserves title ties", () => {
  const now = Date.parse("2026-10-13T12:00:00Z");
  const a = createAdminAnalyticsAccumulator(7, now);
  a.addLead({ id: "new", created_at: "2026-10-12", status: "needs_manual_followup", current_stage: "handoff", gift_link_clicked_at: "2026-10-12" });
  a.addLead({ id: "old", created_at: "2026-01-01", status: "qualified", current_stage: "menu", gift_link_clicked_at: null });
  const add = (event_name, fields = {}) => a.addEvent({ user_id: "new", event_name, category: null, created_at: "2026-10-12", metadata: {}, ...fields });
  for (let i = 0; i < 2; i++) {
    for (const name of ["library_opened", "marketing_selected", "marketing_quiz_completed", "material_completed", "material_link_clicked", "gift_link_clicked", "next_material_clicked"]) add(name);
    for (const question of ["marketing_roi_quiz_q1", "marketing_roi_quiz_q2", "marketing_roi_quiz_q3"]) add("marketing_quiz_answered", { metadata: { question } });
    for (const category of ["life", "business"]) add("category_selected", { category });
    for (const title of ["Первый", "Второй", "Третий", "Четвёртый"]) add("material_presented", { metadata: { title } });
  }
  add("category_selected", { user_id: "old", category: "business" });
  add("material_presented", { created_at: "2026-01-01", metadata: { title: "Старый" } });
  add("prediction_ball_spun", { metadata: { result: "Рискуй" } });
  assert.deepEqual(a.result(), {
    period: 7, people: 1, menu: 1, marketing: 1, quizAnswers: [1, 1, 1], quizCompleted: 1,
    category: 1, life: 1, business: 1, materialSelected: 1, materialLinkClicked: 1,
    materialCompleted: 1, giftClicked: 1, qualified: 1, handoff: 1,
    clicks: { category: 5, material: 8, link: 2, next: 2, gift: 2 },
    categoryClicks: { life: 2, business: 3 },
    topMaterials: ["Первый", "Второй", "Третий"].map(title => ({ title, clicks: 2 })),
  });
});

test("event existence reads at most one ID without a full count", async (t) => {
  process.env.SUPABASE_URL = "https://db.test";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "test-key";
  let exists = true;
  t.mock.method(globalThis, "fetch", async (url, init) => {
    const query = new URL(url).searchParams;
    assert.equal(query.get("limit"), "1");
    assert.equal(query.get("select"), "id");
    assert.equal(query.get("category"), "eq.life");
    assert.equal(init.headers.Prefer, undefined);
    return Response.json(exists ? [{ id: "event" }] : []);
  });
  assert.equal(await supabaseStorageAdapter.hasUserEvent("u", "reward_unlocked", "life"), true);
  exists = false;
  assert.equal(await supabaseStorageAdapter.hasUserEvent("u", "reward_unlocked", "life"), false);
});

test("library actions reuse progress and refresh memory only once", async (t) => {
  Object.assign(process.env, { STORAGE_DRIVER: "local", LOCAL_DATA_MODE: "memory", LIBRARY_ENABLED: "true", LIBRARY_FOLLOWUPS_ENABLED: "false", TELEGRAM_BOT_TOKEN: "test", LIBRARY_LINK_SECRET: "storage-optimization-test-secret" });
  t.mock.method(globalThis, "fetch", async () => Response.json({ ok: true, result: { message_id: 100 } }));
  const materials = t.mock.method(localStorageAdapter, "getActiveLibraryMaterials");
  const eventReads = t.mock.method(localStorageAdapter, "getRecentUserEvents");
  const profile = await localStorageAdapter.getActiveExpertProfile();
  const call = async text => handleLibraryTelegramAction({ message: { telegramUserId: 880, telegramChatId: 880, telegramUsername: null, firstName: "test", lastName: null, telegramMessageId: 100, callbackQueryId: "test", text }, expertProfile: profile, existingLead: await localStorageAdapter.getLeadByTelegramUserId(880), publicBaseUrl: "https://test.example" });
  await call("lib:cat:life");
  assert.equal(materials.mock.callCount(), 1);
  const [material] = await localStorageAdapter.getActiveLibraryMaterials("life");
  materials.mock.resetCalls(); eventReads.mock.resetCalls();
  await call(`lib:mat:${material.id}`);
  assert.equal(eventReads.mock.callCount(), 1);
  materials.mock.resetCalls();
  await call(`lib:done:${material.id}`);
  assert.equal(materials.mock.callCount(), 1);
  const lead = await localStorageAdapter.getLeadByTelegramUserId(880);
  const history = await localStorageAdapter.getRecentMessagesByLeadId(lead.id);
  const summary = (await localStorageAdapter.getAdminLeads()).find(row => row.id === lead.id);
  assert.equal(summary.messageCount, history.length);
  assert.equal(summary.lastMessageAt, history[0].created_at);
});

test("file storage writes once per message and compacts JSON without dropping retained fields", async () => {
  const folder = await mkdtemp(path.join(tmpdir(), "neiro-storage-test-"));
  try {
    const result = JSON.parse(execFileSync(process.execPath, ["--import", new URL("./register-typescript.mjs", import.meta.url).href, "--input-type=module", "-e", `
      import fs from 'node:fs/promises';
      import { syncBuiltinESMExports } from 'node:module';
      const original = fs.writeFile; let writes = 0;
      fs.writeFile = (...args) => { writes++; return original(...args); }; syncBuiltinESMExports();
      const storage = await import(${JSON.stringify(new URL("../lib/storage/index.ts", import.meta.url).href)});
      await storage.getActiveExpertProfile(); writes = 0;
      for(let i=0;i<15;i++) await storage.insertMessage({leadId:'test-user',expertProfileId:null,direction:'incoming',channel:'telegram',telegramMessageId:i,text:'Сообщение '+i,messageType:'user'});
      console.log(JSON.stringify({writes}));
    `], { cwd: folder, env: { ...process.env, STORAGE_DRIVER: "local", LOCAL_DATA_MODE: "file" }, encoding: "utf8" }));
    assert.equal(result.writes, 15);
    const raw = await readFile(path.join(folder, ".data", "neurosaler.json"), "utf8");
    const db = JSON.parse(raw);
    assert.equal(db.messages.length, 12);
    assert.equal(raw, JSON.stringify(db) + "\n");
    assert.ok(db.libraryMaterials.length >= 10);
    assert.ok(db.messages.every(m => m.text.startsWith("Сообщение ") && m.message_type === "user"));
  } finally {
    assert.ok(path.resolve(folder).startsWith(path.join(path.resolve(tmpdir()), "neiro-storage-test-")));
    await rm(folder, { recursive: true, force: true });
  }
});
