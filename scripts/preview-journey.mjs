// Local UI smoke test with synthetic data and a mocked Telegram SDK. No external messages.
import "../tests/register-typescript.mjs";
import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { pathToFileURL } from "node:url";
Object.assign(process.env, { STORAGE_DRIVER: "local", LOCAL_DATA_MODE: "memory", LIBRARY_LINK_SECRET: "preview-library-secret-long-enough" });
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ? pathToFileURL(process.env.PLAYWRIGHT_MODULE).href : "playwright");
const storage = await import("../lib/storage/index.ts");
const { getJourneyDashboard } = await import("../lib/library/journey.ts");
const expert = await storage.getActiveExpertProfile();
const lead = await storage.createLead({ expertProfileId: expert.id, telegramUserId: 920, telegramChatId: 920, telegramUsername: null,
  firstName: "Александра", lastName: null, source: "test", status: "active", currentStage: "ecosystem_menu", matchedOffer: null, lastUserMessage: null, warmthLevel: "cold" });
const materials = await storage.getActiveLibraryMaterials("life");
await storage.upsertLibraryProgress(lead.id, materials[0].id, "completed");
await storage.upsertUserLibraryProfile(lead.id, { active_days: 7, journey_goal: "Освободить голову и принять важное решение", recommended_material_ids: materials.map(material => material.id) });
const data = { ...await getJourneyDashboard(lead.id, "https://neiro.test"), firstName: "Александра", remindersAvailable: true };
const browser = await chromium.launch({ channel: "chrome", headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.route("https://telegram.org/js/telegram-web-app.js", route => route.fulfill({ contentType: "application/javascript", body: 'window.Telegram={WebApp:{initData:"visual",ready(){},expand(){},close(){window.closedToBot=true},openLink(url){window.openedMaterial=url}}};' }));
  await page.route("**/api/journey", route => {
    const input = route.request().postDataJSON();
    if (input.action === "reminders") data.remindersEnabled = input.enabled;
    return route.fulfill({ json: data });
  });
  await page.goto(process.env.PREVIEW_URL || "http://localhost:3017/journey");
  await page.getByRole("heading", { name: data.goal }).waitFor();
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
  await page.getByRole("button", { name: /Открыть материал/ }).first().click();
  assert.ok((await page.evaluate(() => window.openedMaterial)).includes("/api/library/open?token="));
  await mkdir(".agent/artifacts", { recursive: true });
  await page.screenshot({ path: ".agent/artifacts/journey-track.png", fullPage: true });
  await page.getByRole("button", { name: "Мои награды", exact: false }).click();
  await page.getByRole("heading", { name: "Первый шаг" }).waitFor();
  await page.screenshot({ path: ".agent/artifacts/journey-rewards.png", fullPage: true });
  await page.getByRole("switch", { name: "Напоминания" }).click();
  await page.waitForFunction(() => document.querySelector('[role="switch"]').getAttribute("aria-checked") === "false");
  await page.setViewportSize({ width: 320, height: 740 });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
  assert.deepEqual(errors, []);
  console.log("Mobile layout 390/320 px, track link, award tab, reminder switch and browser errors checked. Screenshots: .agent/artifacts/journey-{track,rewards}.png");
} finally { await browser.close(); }
