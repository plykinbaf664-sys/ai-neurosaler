import "server-only";

import {
  getDueLibraryFollowupProfiles,
  getLeadById,
  getUserLibraryProfile,
  insertMessage,
  upsertUserLibraryProfile,
  type LibraryMaterialRow,
  type UserLibraryProfileRow,
} from "@/lib/storage";
import { sendTextMessage } from "@/lib/telegram";
import { trackUserEvent } from "@/lib/tracking/events";

const DAY_MS = 24 * 60 * 60 * 1_000;
const DEFAULT_DELAY_HOURS = 24;
const DEFAULT_INACTIVITY_HOURS = 12;

function boundedHours(name: string, fallback: number) {
  const parsed = Number.parseInt(process.env[name] ?? "", 10);
  if (!Number.isFinite(parsed) || parsed < 1) return fallback;
  return Math.min(parsed, 168);
}

function addHours(iso: string, hours: number) {
  return new Date(Date.parse(iso) + hours * 60 * 60 * 1_000).toISOString();
}

export function isLibraryFollowupsEnabled() {
  return process.env.LIBRARY_FOLLOWUPS_ENABLED === "true";
}

export function buildLibraryFollowupText(profile: UserLibraryProfileRow) {
  if (profile.last_material_slug === "vygruzi-golovu-za-7-min") {
    return "Слушай, ты открывал материал про выгрузку головы. Получилось попробовать или пока только сохранил на потом?";
  }
  if (profile.last_material_slug === "300-otzyvov-za-5-minut") {
    return "Ты смотрел материал про 300 отзывов за 5 минут. Хочешь, я помогу прикинуть, как такую механику применить к твоей теме?";
  }
  if (profile.last_material_slug === "chto-komanda-poobeshchala-i-zabyla") {
    return "Ты открывал материал про забытые договорённости в команде. У тебя сейчас чаще теряются задачи, сроки или ответственность между людьми?";
  }

  const title = profile.last_material_title ? ` «${profile.last_material_title}»` : "";
  return profile.last_category === "business"
    ? `Ты открывал материал${title}. Получилось посмотреть, что из этого можно применить к процессам команды?`
    : `Ты открывал материал${title}. Получилось спокойно посмотреть или пока отложил на потом?`;
}

export async function scheduleLibraryFollowup(userId: string, material: LibraryMaterialRow) {
  if (!isLibraryFollowupsEnabled()) return null;
  const now = new Date().toISOString();
  const profile = await getUserLibraryProfile(userId);

  if (
    profile?.last_followup_sent_at &&
    Date.now() - Date.parse(profile.last_followup_sent_at) < DAY_MS
  ) {
    return profile;
  }

  return upsertUserLibraryProfile(userId, {
    last_route: material.category === "business" ? "business" : "life",
    last_category: material.category === "business" ? "business" : "life",
    last_material_slug: material.slug,
    last_material_title: material.title,
    last_material_status: "opened",
    next_followup_due_at: addHours(
      now,
      boundedHours("LIBRARY_FOLLOWUP_DELAY_HOURS", DEFAULT_DELAY_HOURS),
    ),
  });
}

export async function scheduleRequestedLibraryReminder(userId: string) {
  if (!isLibraryFollowupsEnabled()) return false;
  const profile = await getUserLibraryProfile(userId);
  if (!profile?.last_material_slug) return false;
  const now = new Date().toISOString();
  await upsertUserLibraryProfile(userId, {
    next_followup_due_at: addHours(
      now,
      boundedHours("LIBRARY_FOLLOWUP_DELAY_HOURS", DEFAULT_DELAY_HOURS),
    ),
    last_interaction_at: now,
  });
  return true;
}

export async function cancelLibraryFollowup(userId: string) {
  return upsertUserLibraryProfile(userId, { next_followup_due_at: null });
}

export async function sendDueLibraryFollowups(now = new Date()) {
  if (!isLibraryFollowupsEnabled()) return { disabled: true, processed: 0, sent: 0 };

  const nowIso = now.toISOString();
  const profiles = await getDueLibraryFollowupProfiles(nowIso, 50);
  const inactivityHours = boundedHours("LIBRARY_FOLLOWUP_INACTIVITY_HOURS", DEFAULT_INACTIVITY_HOURS);
  let sent = 0;

  for (const profile of profiles) {
    const lead = await getLeadById(profile.user_id);

    if (!lead || profile.last_material_status === "completed") {
      await upsertUserLibraryProfile(profile.user_id, { next_followup_due_at: null });
      continue;
    }

    if (
      profile.last_followup_sent_at &&
      now.getTime() - Date.parse(profile.last_followup_sent_at) < DAY_MS
    ) {
      await upsertUserLibraryProfile(profile.user_id, {
        next_followup_due_at: addHours(profile.last_followup_sent_at, 24),
      });
      continue;
    }

    const inactiveUntil = addHours(profile.last_interaction_at, inactivityHours);
    if (inactiveUntil > nowIso) {
      await upsertUserLibraryProfile(profile.user_id, { next_followup_due_at: inactiveUntil });
      continue;
    }

    const text = buildLibraryFollowupText(profile);
    const result = await sendTextMessage(lead.telegram_chat_id, text);
    await insertMessage({
      leadId: lead.id,
      expertProfileId: lead.expert_profile_id,
      direction: "outgoing",
      channel: "telegram",
      telegramMessageId: result.telegramMessageId,
      text,
      messageType: "library_followup",
    });
    await trackUserEvent({
      userId: lead.id,
      eventName: "library_followup_sent",
      category: profile.last_category,
      metadata: {
        route: profile.last_route,
        slug: profile.last_material_slug,
        followup_type: "opened_material_checkin",
      },
    });
    await upsertUserLibraryProfile(lead.id, {
      last_followup_type: "opened_material_checkin",
      last_followup_sent_at: nowIso,
      next_followup_due_at: null,
    });
    sent += 1;
  }

  return { disabled: false, processed: profiles.length, sent };
}
