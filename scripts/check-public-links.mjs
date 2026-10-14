// Read-only check. No tracked user URLs, bot messages or DB mutations are issued.
import "../tests/register-typescript.mjs";
import { getCalendarLink, getPublicBaseUrl } from "../lib/public-links.ts";
import seed from "../data/local-db.seed.json" with { type: "json" };

async function rows(resource, query) {
  const response = await fetch(`${process.env.SUPABASE_URL.replace(/\/$/, "")}/rest/v1/${resource}?${new URLSearchParams(query)}`, {
    headers: { apikey: process.env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}` },
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) throw new Error(`Cannot read ${resource}: HTTP ${response.status}`);
  return response.json();
}
const live = process.argv.includes("--live");
const materials = live ? await rows("library_materials", { select: "title,url", is_active: "eq.true", order: "category,position" }) : seed.libraryMaterials.filter(material => material.is_active);
const profiles = live ? await rows("expert_profile", { select: "gift_url", is_active: "eq.true", limit: "1" }) : seed.expertProfiles.filter(profile => profile.is_active);
const links = [...materials.map(material => ({ name: material.title, url: material.url })),
  { name: "calendar", url: getCalendarLink() }, ...profiles.map(profile => ({ name: "gift", url: process.env.NEIRO_GIFT_URL?.trim() || profile.gift_url }))];
const baseArgument = process.argv.indexOf("--base-url");
if (baseArgument !== -1 && !process.argv[baseArgument + 1]) throw new Error("--base-url requires an application URL");
const baseUrl = baseArgument !== -1 ? new URL(process.argv[baseArgument + 1]).origin : live ? getPublicBaseUrl() : null;
if (baseUrl) {
  links.push(...["/journey", "/library"].map(path => ({ name: path, url: new URL(path, baseUrl).href })),
    { name: "Telegram Mini App SDK", url: "https://telegram.org/js/telegram-web-app.js" },
    ...["/api/library/open", "/api/library/next"].map(path => ({ name: `${path} rejects unsigned requests`, url: new URL(path, baseUrl).href, expectedStatus: 401 })));
}
if (live) {
  const { buildPredictionBallShareUrl } = await import("../lib/prediction-ball.ts");
  const response = await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/getMe`, { signal: AbortSignal.timeout(15000) });
  const bot = await response.json();
  if (!response.ok || !bot.ok || !bot.result?.username) throw new Error(`Cannot resolve Telegram bot: HTTP ${response.status}`);
  const share = new URL(buildPredictionBallShareUrl("Идея на миллион", bot.result.username));
  links.push({ name: "ball deep link", url: share.searchParams.get("url") }, { name: "ball share", url: share.href });
}
const report = [];
for (const link of links) {
  try {
    const url = new URL(link.url, baseUrl || undefined);
    if (!["http:", "https:"].includes(url.protocol)) throw new Error("Invalid URL protocol");
    // Never follow signed/tracked URLs: even GET can change user progress or analytics.
    if (url.searchParams.has("token") || url.pathname.startsWith("/api/gift/")) throw new Error("Tracked URLs require isolated tests");
    const response = await fetch(url, { redirect: "follow", signal: AbortSignal.timeout(15000) });
    const body = await response.text();
    const title = body.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1]?.trim();
    const pageError = /ERR_NGROK_\d+/.test(body) || /^(?:404(?:\s|$)|Page not found|Страница не найдена)/i.test(title || "");
    report.push({ ...link, status: response.status, ok: response.status === (link.expectedStatus ?? 200) && !pageError,
      destination: response.url, ...(title ? { title } : {}) });
  } catch (error) { report.push({ ...link, status: "unverified", ok: false, error: error.name }); }
}
console.log(JSON.stringify({ source: live ? "supabase" : "seed", checkedAt: new Date().toISOString(), links: report }, null, 2));
if (report.some(link => !link.ok)) process.exitCode = 1;
