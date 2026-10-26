import "server-only";
import { claimAiMapFollowup, getDueAiMapProfiles, getLeadById, getLibraryMaterialById, getUserLibraryProfile,
  insertMessage, stopAiMapFollowups } from "@/lib/storage";
import type { AiMapState } from "@/lib/storage/types";
import { sendTextMessage, TelegramApiError } from "@/lib/telegram";
import { trackUserEvent } from "@/lib/tracking/events";
import { AI_MAP_ACTION, AI_MAP_PROCESSES, PROCESS_AUDIT_ACTION, isAiMapEnabled } from "@/lib/neiroclozer/ai-map";
import { mapLeadStopped } from "@/lib/neiroclozer/ai-map-telegram";

export const AI_MAP_FOLLOWUP_HOURS = [1, 3, 24, 48];
export function aiMapDueAt(state: AiMapState, step: number) {
  return new Date(Date.parse(state.resultShownAt!) + AI_MAP_FOLLOWUP_HOURS[step - 1] * 3_600_000).toISOString();
}

export function buildAiMapFollowup(state: AiMapState, step: number) {
  const process = AI_MAP_PROCESSES[state.result!.processKeys[0]];
  if (step === 1) return `**В твоей AI-карте главный пункт — №1: ${process.title}.**\n\nЕсли сегодня есть 20 минут, попробуй только его.\n\n${process.action}\n\nЭтого достаточно, чтобы проверить, есть ли реальная ценность.`;
  if (step === 2) return `**Главная ошибка с AI — автоматизировать то, что сначала не проверили вручную.**\n\nСначала: данные → AI → полезный результат. Потом — автоматизация.\n\n${process.action}\n\nСравни результат с исходными данными: что полезно, а что пришлось исправить?`;
  if (step === 3) return "**Если ручной тест дал пользу, следующий вопрос — зачем делать его руками каждый раз?**\n\nРазовый AI: ты копируешь данные, запускаешь запрос и переносишь результат.\n\nAI-система: сама получает данные, обрабатывает и передаёт результат в нужное место. Человек контролирует важные решения.\n\nМожем разобрать один процесс из твоей карты и нарисовать схему внедрения.";
  return "**Твоя AI-карта сохранена.**\n\nМожно вернуться к ней и продолжить самостоятельно. Если хочешь превратить один процесс в постоянную систему — разберём его с Александром. Это последнее автоматическое сообщение по карте.";
}

export async function sendDueAiMapFollowups(now = new Date()) {
  if (!isAiMapEnabled() || process.env.QUIZ_FOLLOWUPS_ENABLED !== "true") return { disabled: true, processed: 0, sent: 0, failed: 0 };
  const profiles = await getDueAiMapProfiles(now.toISOString(), 50);
  let sent = 0, failed = 0;
  for (const profile of profiles) {
    try {
      const lead = await getLeadById(profile.user_id);
      const state = profile.ai_map;
      if (!lead || !state?.result || !state.resultShownAt || state.stopped || profile.reminders_enabled === false || mapLeadStopped(lead)) {
        await stopAiMapFollowups(profile.user_id);
        continue;
      }
      // After a long outage send only the latest due step, never a burst of old messages.
      const dueSteps = AI_MAP_FOLLOWUP_HOURS.map((_, i) => i + 1).filter(step => step > state.followupStep && aiMapDueAt(state, step) <= now.toISOString());
      const step = dueSteps.at(-1);
      if (!step) continue;
      const nextDue = step < 4 ? aiMapDueAt(state, step + 1) : null;
      if (!await claimAiMapFollowup(lead.id, state.version, step, now.toISOString(), nextDue)) continue;
      // Stop conditions are rechecked after the atomic claim, immediately before delivery.
      const freshLead = await getLeadById(lead.id);
      const freshProfile = await getUserLibraryProfile(lead.id);
      if (!freshLead || mapLeadStopped(freshLead) || freshProfile?.ai_map?.stopped || freshProfile?.reminders_enabled === false) {
        await stopAiMapFollowups(lead.id); continue;
      }
      const primary = AI_MAP_PROCESSES[state.result.processKeys[0]];
      const material = primary.slug ? (await Promise.all(state.result.materialIds.map(id => getLibraryMaterialById(id)))).find(m => m?.is_active && m.slug === primary.slug) : null;
      const text = buildAiMapFollowup(state, step);
      const result = await sendTextMessage(lead.telegram_chat_id, text, { inline_keyboard: [
        ...(step <= 2 && material ? [[{ text: material.title.slice(0, 60), callback_data: `ai:m:${material.id}` }]] : []),
        ...(step >= 3 ? [[{ text: "🔥 Разобрать мой процесс с Александром", callback_data: PROCESS_AUDIT_ACTION }]] : []),
        [{ text: "Моя AI-карта", callback_data: AI_MAP_ACTION }],
        [{ text: "Не напоминать", callback_data: "ai:stop" }],
      ] });
      await insertMessage({ leadId: lead.id, expertProfileId: lead.expert_profile_id, direction: "outgoing", channel: "telegram",
        telegramMessageId: result.telegramMessageId, text, messageType: "library_followup" });
      await trackUserEvent({ userId: lead.id, eventName: "ai_map_followup_sent", metadata: { step } });
      sent++;
    } catch (error) {
      failed++;
      if (error instanceof TelegramApiError && error.status === 403) await stopAiMapFollowups(profile.user_id);
      console.error("AI map followup failed", profile.user_id, error instanceof Error ? error.name : "unknown");
      // A claimed step is never retried: Telegram has no idempotency key for uncertain sends.
    }
  }
  return { disabled: false, processed: profiles.length, sent, failed };
}
