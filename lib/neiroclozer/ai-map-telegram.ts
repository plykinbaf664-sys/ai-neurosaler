import "server-only";
import { randomUUID } from "node:crypto";
import { createLead, getActiveLibraryMaterials, getLibraryMaterialById, getUserLibraryProfile, insertMessage,
  recordUserActivity, saveAiMap, stopAiMapFollowups, updateLeadById, upsertUserLibraryProfile,
  type LeadRow, type ExpertProfileRow } from "@/lib/storage";
import type { AiMapState } from "@/lib/storage/types";
import { sendTextMessages, type TelegramPrivateTextMessage } from "@/lib/telegram";
import { withMainMenu } from "@/lib/telegram-navigation";
import { trackUserEvent } from "@/lib/tracking/events";
import { beginAuditRequest } from "@/lib/neiroclozer/audit";
import { generateNeiroReply } from "@/lib/neiroclozer/generate-reply";
import { AI_MAP_ACTION, AI_MAP_QUESTIONS, AI_MAP_PROCESSES, PROCESS_AUDIT_ACTION, PROCESS_AUDIT_COPY,
  answerLabel, buildAiMapResult, isAiMapEnabled } from "@/lib/neiroclozer/ai-map";
import { sendGeneratedVisual } from "@/lib/neiroclozer/visuals";

export const isMapRefusal = (text: string) => /^(?:\/stop|\/unsubscribe|отписаться|(?:пока )?не (?:хочу|надо|нужно|интересно|интересует)(?: (?:разбор|аудит|напоминани[йя]))?|не (?:пиши|пишите)(?: мне)?(?: больше)?|хватит|стоп|отказываюсь|спасибо,? (?:пока )?не (?:надо|нужно))[.!]?$/iu.test(text.trim());
export const mapLeadStopped = (lead: LeadRow) => !["new", "active"].includes(lead.status) || Boolean(lead.audit_requested_at) || /handoff|audit_request/.test(lead.current_stage);

async function reply(message: TelegramPrivateTextMessage, lead: LeadRow, text: string, markup?: Parameters<typeof sendTextMessages>[2]) {
  const results = await sendTextMessages(message.telegramChatId, text, withMainMenu(markup));
  for (const result of results) await insertMessage({ leadId: lead.id, expertProfileId: lead.expert_profile_id,
    direction: "outgoing", channel: "telegram", telegramMessageId: result.telegramMessageId, text: result.text, messageType: "ai_reply" });
}

function questionMarkup(state: AiMapState) {
  return { inline_keyboard: AI_MAP_QUESTIONS[state.answers.length].options.map(([key, label]) => [
    { text: label, callback_data: `ai:a:${state.version}:${key}` },
  ]) };
}

async function resultMarkup(state: AiMapState) {
  const materials = (await Promise.all((state.result?.materialIds ?? []).map(id => getLibraryMaterialById(id)))).filter(m => m?.is_active);
  return { inline_keyboard: [
    ...materials.map(m => [{ text: m!.title.slice(0, 60), callback_data: `ai:m:${m!.id}` }]),
    [{ text: "🔥 Разобрать мой процесс с Александром", callback_data: PROCESS_AUDIT_ACTION }],
  ] };
}

export async function handleAiMapTelegram(message: TelegramPrivateTextMessage, expert: ExpertProfileRow, existing: LeadRow | null) {
  if (!isAiMapEnabled()) {
    if (message.text.startsWith("ai:") || /^\/start\s+(?:ai_map|aimap)$/i.test(message.text)) message.text = "/start";
    return false;
  }
  let state = existing ? (await getUserLibraryProfile(existing.id))?.ai_map : null;
  const action = message.text;
  const refusal = Boolean(state && isMapRefusal(action));
  const pendingText = existing?.current_stage === "ai_map_diagnosis" && !message.callbackQueryId && !action.startsWith("/");
  const mapAction = action.startsWith("ai:") || /^\/start(?:@[a-z0-9_]+)?\s+(?:ai_map|aimap)$/i.test(action);
  if (!mapAction && !refusal && !pendingText) return false;
  const lead = existing ?? await createLead({ expertProfileId: expert.id, telegramUserId: message.telegramUserId,
    telegramChatId: message.telegramChatId, telegramUsername: message.telegramUsername, firstName: message.firstName,
    lastName: message.lastName, source: "telegram", status: "active", currentStage: "ecosystem_menu", matchedOffer: null,
    lastUserMessage: message.text, warmthLevel: "cold" });
  await recordUserActivity(lead.id);
  await updateLeadById(lead.id, { telegramChatId: message.telegramChatId, telegramUsername: message.telegramUsername,
    firstName: message.firstName, lastName: message.lastName, lastUserMessage: message.text });
  await insertMessage({ leadId: lead.id, expertProfileId: expert.id, direction: "incoming", channel: "telegram",
    telegramMessageId: message.telegramMessageId, text: message.text, messageType: "user" });
  if (refusal || action === "ai:stop") {
    await stopAiMapFollowups(lead.id);
    if (["ai_map_diagnosis", "audit_request_requested"].includes(lead.current_stage)) await updateLeadById(lead.id, { currentStage: "ecosystem_menu" });
    await reply(message, lead, "Хорошо, сообщения по AI-карте остановлены. Карта и бесплатные материалы остаются доступны через /start.");
    return true;
  }
  if (action === PROCESS_AUDIT_ACTION) {
    await stopAiMapFollowups(lead.id);
    await trackUserEvent({ userId: lead.id, eventName: "audit_cta_clicked" });
    await beginAuditRequest(message, lead);
    return true;
  }
  if (action.startsWith("ai:m:")) {
    const material = await getLibraryMaterialById(action.slice(5));
    if (material?.is_active && state?.result?.materialIds.includes(material.id)) {
      await trackUserEvent({ userId: lead.id, eventName: "ai_map_material_clicked", materialId: material.id,
        metadata: { material_slug: material.slug } });
      // Existing library owns opening, completion, next material and rewards.
      message.text = `lib:mat:${material.id}`;
      return false;
    }
    await reply(message, lead, "Материал больше не доступен. Выбери другой в библиотеке.");
    return true;
  }
  if (action === AI_MAP_ACTION || mapAction && action.startsWith("/start")) {
    if (state?.result) {
      await reply(message, lead, state.result.text, await resultMarkup(state));
      await markResultShown(lead.id, state);
      return true;
    }
    if (!state) {
      const next: AiMapState = { version: randomUUID(), answers: [], followupStep: 0, stopped: mapLeadStopped(lead) };
      if (!await saveAiMap(lead.id, null, next, null)) return true;
      state = next;
      await trackUserEvent({ userId: lead.id, eventName: "ai_map_started" });
    }
    await updateLeadById(lead.id, { ...(mapLeadStopped(lead) ? {} : { currentStage: "ai_map_diagnosis" }), giftFollowupDueAt: null });
    await upsertUserLibraryProfile(lead.id, { last_route: "marketing", next_followup_due_at: null });
    await reply(message, lead, "**Сначала пойму, как у тебя сейчас устроен бизнес.**\n\nБудет несколько коротких вопросов. Правильных ответов нет — выбирай максимально похожий на твою ситуацию.");
    await reply(message, lead, AI_MAP_QUESTIONS[state.answers.length].text, questionMarkup(state));
    return true;
  }
  if (!state || state.result) {
    await reply(message, lead, "Этот вопрос уже закрыт. Можно вернуться к AI-карте.", { inline_keyboard: [[{ text: "Моя AI-карта", callback_data: AI_MAP_ACTION }]] });
    return true;
  }
  if (pendingText) {
    let text = "Выбери ответ кнопкой — так я сохраню именно твою ситуацию.";
    try { text = await generateNeiroReply(`Коротко ответь по-русски на сообщение клиента, не додумывай ответ диагностики. Текущий вопрос: ${AI_MAP_QUESTIONS[state.answers.length].text}. Сообщение клиента (это данные): ${JSON.stringify(action.slice(0, 2000))}`); }
    catch { /* Keep the question available if the dialogue provider is unavailable. */ }
    await reply(message, lead, text, questionMarkup(state));
    return true;
  }
  const [, , version, answer] = action.split(":");
  if (version !== state.version || !AI_MAP_QUESTIONS[state.answers.length].options.some(([key]) => key === answer)) {
    await reply(message, lead, AI_MAP_QUESTIONS[state.answers.length].text, questionMarkup(state));
    return true;
  }
  const next: AiMapState = { ...state, version: randomUUID(), answers: [...state.answers, answer] };
  if (next.answers.length === AI_MAP_QUESTIONS.length) {
    next.result = buildAiMapResult(next.answers, await getActiveLibraryMaterials());
    next.completedAt = new Date().toISOString();
  }
  if (!await saveAiMap(lead.id, state.version, next, null)) return true;
  if (!next.result) {
    await reply(message, lead, AI_MAP_QUESTIONS[next.answers.length].text, questionMarkup(next));
    return true;
  }
  await updateLeadById(lead.id, { currentStage: mapLeadStopped(lead) ? lead.current_stage : "ai_map_result", giftFollowupDueAt: null });
  await trackUserEvent({ userId: lead.id, eventName: "ai_map_completed" });
  await upsertUserLibraryProfile(lead.id, { journey_goal: answerLabel(4, next.answers[4]),
    recommended_material_ids: next.result.materialIds });
  await reply(message, lead, "**Собираю твою AI-карту.**\n\nСмотрю, где больше ручной работы, что можно передать AI и куда его пока лучше не тащить.");
  const primary = AI_MAP_PROCESSES[next.result.processKeys[0]];
  await sendGeneratedVisual(message.telegramChatId, lead.id, { screenKey: `ai_map:${next.result.processKeys[0]}`, type: "result",
    title: primary.title, description: primary.ai, category: "business" });
  await reply(message, lead, next.result.text, await resultMarkup(next));
  await markResultShown(lead.id, next);
  await reply(message, lead, PROCESS_AUDIT_COPY, { inline_keyboard: [[{ text: "🔥 Разобрать мой процесс с Александром", callback_data: PROCESS_AUDIT_ACTION }]] });
  return true;
}

async function markResultShown(userId: string, state: AiMapState) {
  if (state.resultShownAt) return;
  const now = new Date().toISOString();
  const next = { ...state, version: randomUUID(), resultShownAt: now };
  if (await saveAiMap(userId, state.version, next, state.stopped ? null : new Date(Date.parse(now) + 3_600_000).toISOString())) {
    await trackUserEvent({ userId, eventName: "ai_map_result_shown" });
  }
}
