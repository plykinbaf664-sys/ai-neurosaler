// Read-only check. No tracked user URLs, bot messages or DB mutations are issued.
import "../tests/register-typescript.mjs";
import { getCalendarLink } from "../lib/public-links.ts";
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
  { name: "calendar", url: getCalendarLink() }, ...profiles.map(profile => ({ name: "gift", url: process.env.NEIRO_GIFT_URL || profile.gift_url }))];
const report = [];
for (const link of links) {
  if (!/^https?:\/\//.test(link.url)) { report.push({ ...link, status: "internal" }); continue; }
  try {
    const response = await fetch(link.url, { redirect: "follow", signal: AbortSignal.timeout(15000) });
    await response.body?.cancel();
    report.push({ ...link, status: response.status, destination: response.url });
  } catch (error) { report.push({ ...link, status: "unverified", error: error.name }); }
}
console.log(JSON.stringify({ source: live ? "supabase" : "seed", links: report }, null, 2));
