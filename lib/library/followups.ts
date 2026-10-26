import "server-only";
import { claimLibraryFollowup, getDueLibraryFollowupProfiles, getLeadById, getUserLibraryProfile, insertMessage, upsertUserLibraryProfile, type LibraryMaterialRow, type UserLibraryProfileRow } from "@/lib/storage";
import { getLibraryJourneyState, selectNextMaterial } from "@/lib/library/recommendations";
import { sendTextMessage } from "@/lib/telegram";
import { trackUserEvent } from "@/lib/tracking/events";

const DAY_MS = 86_400_000;
function boundedHours(name: string, fallback: number) {
  const value = Number.parseInt(process.env[name] ?? "", 10);
  return Number.isFinite(value) && value >= 1 ? Math.min(value, 168) : fallback;
}
function addHours(iso: string, hours: number) {
  return new Date(Date.parse(iso) + hours * 3_600_000).toISOString();
}
export function isLibraryFollowupsEnabled() { return process.env.LIBRARY_FOLLOWUPS_ENABLED === "true"; }

async function nextStep(userId: string, profile: UserLibraryProfileRow) {
  return selectNextMaterial(await getLibraryJourneyState(userId, profile));
}

export function buildLibraryFollowupText(profile: UserLibraryProfileRow, next?: LibraryMaterialRow | null) {
  const previous = profile.last_material_title ? `«${profile.last_material_title}»` : "твой маршрут";
  if (!next) return `Как продвигается ${previous}? Если захочешь продолжить, я на связи.`;
  const sameMaterial = next.slug === profile.last_material_slug && profile.last_material_status !== "completed";
  return [sameMaterial ? `Ты остановился на «${next.title}». Получилось попробовать?` :
    profile.last_material_status === "completed" ? `После ${previous} можно перейти к следующему шагу: «${next.title}».` : `Вернёмся к твоему маршруту? Предлагаю начать с «${next.title}».`,
    next.short_description, "Когда будет удобно — продолжим с этого места."].join("\n\n");
}

export async function scheduleNextStepFollowup(userId: string) {
  if (!isLibraryFollowupsEnabled()) return false;
  const profile = await getUserLibraryProfile(userId);
  if (!profile || profile.reminders_enabled === false || profile.last_route === "marketing" ||
    (process.env.AI_MAP_ENABLED === "true" && profile.ai_map?.resultShownAt && !profile.ai_map.stopped && profile.ai_map.followupStep < 4)) return false;
  const material = await nextStep(userId, profile);
  const now = new Date().toISOString();
  await upsertUserLibraryProfile(userId, { next_followup_due_at: material ? addHours(now, boundedHours("LIBRARY_FOLLOWUP_DELAY_HOURS", 24)) : null });
  return Boolean(material);
}

export async function scheduleLibraryFollowup(userId: string, material: LibraryMaterialRow) {
  if (!isLibraryFollowupsEnabled()) return null;
  await upsertUserLibraryProfile(userId, { last_route: material.category === "business" ? "business" : "life",
    last_category: material.category === "business" ? "business" : "life", last_material_slug: material.slug,
    last_material_title: material.title, last_material_status: "opened" });
  await scheduleNextStepFollowup(userId);
  return getUserLibraryProfile(userId);
}

export async function scheduleRequestedLibraryReminder(userId: string) {
  if (!isLibraryFollowupsEnabled()) return false;
  await upsertUserLibraryProfile(userId, { reminders_enabled: true });
  return scheduleNextStepFollowup(userId);
}

export function cancelLibraryFollowup(userId: string) {
  return upsertUserLibraryProfile(userId, { next_followup_due_at: null });
}

export async function sendDueLibraryFollowups(now = new Date()) {
  if (!isLibraryFollowupsEnabled()) return { disabled: true, processed: 0, sent: 0, failed: 0 };
  const profiles = await getDueLibraryFollowupProfiles(now.toISOString(), 50);
  let sent = 0;
  let failed = 0;
  for (const profile of profiles) {
    try {
      const lead = await getLeadById(profile.user_id);
      if (!lead || profile.reminders_enabled === false || profile.last_route === "marketing" || lead.current_stage === "audit_request_requested" ||
        (process.env.AI_MAP_ENABLED === "true" && profile.ai_map?.resultShownAt && !profile.ai_map.stopped && profile.ai_map.followupStep < 4)) {
        await cancelLibraryFollowup(profile.user_id);
        continue;
      }
      const inactiveUntil = addHours(profile.last_interaction_at, boundedHours("LIBRARY_FOLLOWUP_INACTIVITY_HOURS", 12));
      const cooldownUntil = profile.last_followup_sent_at ? new Date(Date.parse(profile.last_followup_sent_at) + DAY_MS).toISOString() : "";
      const nextDue = [inactiveUntil, cooldownUntil].sort().at(-1)!;
      if (nextDue > now.toISOString()) {
        await upsertUserLibraryProfile(profile.user_id, { next_followup_due_at: nextDue });
        continue;
      }
      const material = await nextStep(profile.user_id, profile);
      if (!material) { await cancelLibraryFollowup(profile.user_id); continue; }
      if (!await claimLibraryFollowup(profile.user_id, profile.next_followup_due_at!, now.toISOString(), profile.last_interaction_at)) continue;
      const text = buildLibraryFollowupText(profile, material);
      const result = await sendTextMessage(lead.telegram_chat_id, text, { inline_keyboard: [
        [{ text: "Продолжить", callback_data: `lib:mat:${material.id}` }],
        [{ text: "Не напоминать", callback_data: "lib:reminders:off" }],
      ] });
      await insertMessage({ leadId: lead.id, expertProfileId: lead.expert_profile_id, direction: "outgoing", channel: "telegram", telegramMessageId: result.telegramMessageId, text, messageType: "library_followup" });
      await trackUserEvent({ userId: lead.id, eventName: "library_followup_sent", materialId: material.id, category: material.category, metadata: { followup_type: "next_step" } });
      await upsertUserLibraryProfile(lead.id, { last_followup_type: "next_step" });
      sent++;
    } catch (error) {
      failed++;
      // Do not retry an uncertain delivery immediately: this prevents duplicate nudges.
      console.error("Library followup failed:", profile.user_id, error instanceof Error ? error.name : "unknown");
    }
  }
  return { disabled: false, processed: profiles.length, sent, failed };
}
