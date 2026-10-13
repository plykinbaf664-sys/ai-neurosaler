import "server-only";

import {
  createLead,
  insertMessage,
  recordUserActivity,
  upsertUserLibraryProfile,
  updateLeadById,
  type ExpertProfileRow,
  type LeadRow,
  type LibraryMaterialRow,
} from "@/lib/storage";
import { LIBRARY_CATEGORIES, getLibraryCategory, getLibraryCategoryLabel, isLibraryEnabled } from "@/lib/library/config";
import { getMaterialById } from "@/lib/library/materials";
import { getCategoryProgress, markMaterialCompleted, markMaterialOpened, type CategoryProgress } from "@/lib/library/progress";
import {
  getLibraryJourneyState,
  getJourneyTrack,
  getNextMaterialAfter,
  getNextRecommendedMaterial,
} from "@/lib/library/recommendations";
import { buildContextualLibraryReply } from "@/lib/library/dialogue";
import { formatMaterialCard } from "@/lib/library/presentation";
import { withMainMenu } from "@/lib/telegram-navigation";
import type { MaterialFeedback } from "@/lib/storage/types";
import { unlockCategoryReward } from "@/lib/library/rewards";
import { cancelLibraryFollowup, scheduleRequestedLibraryReminder, scheduleNextStepFollowup } from "@/lib/library/followups";
import {
  getLibraryUserProfile,
  refreshLibraryUserProfile,
  rememberLibraryUserMessage,
  setConversationRoute,
} from "@/lib/library/user-profile";
import { sendTextMessage, sendTextMessages, type TelegramPrivateTextMessage } from "@/lib/telegram";
import { trackUserEvent } from "@/lib/tracking/events";
import { createLibraryToken } from "@/lib/security/library-token";
import { BALL_OPEN_ACTION, handlePredictionBall, isPredictionBallAction } from "@/lib/prediction-ball";
import { getMiniAppUrl } from "@/lib/public-links";

const MAIN_MENU_ACTION = "nav:menu";
const MARKETING_ACTION = "nav:marketing";
const CATEGORY_PREFIX = "lib:cat:";
const CONTINUE_PREFIX = "lib:continue:";
const ALL_PREFIX = "lib:all:";
const MATERIAL_PREFIX = "lib:mat:";
const COMPLETE_PREFIX = "lib:done:";
const NEXT_PREFIX = "lib:next:";
const MATERIALS_PER_MESSAGE = 8;

type LibraryTelegramResult = {
  handled: boolean;
  startMarketing: boolean;
  lead?: LeadRow;
};

function mainMenuMarkup(baseUrl: string) {
  const miniAppUrl = getMiniAppUrl(baseUrl);
  return {
    inline_keyboard: [
      [{ text: "📊 Разобрать маркетинг", callback_data: MARKETING_ACTION }],
      ...LIBRARY_CATEGORIES.map((category) => [
        { text: category.buttonLabel, callback_data: `${CATEGORY_PREFIX}${category.slug}` },
      ]),
      ...(miniAppUrl ? [[{ text: "✨ Мой маршрут и награды", web_app: { url: miniAppUrl } }]] : []),
    ],
  };
}

function categoryNavigationMarkup(category: string) {
  return {
    inline_keyboard: [
      ...predictionBallButtons(category),
      [{ text: "Продолжить", callback_data: `${CONTINUE_PREFIX}${category}` }],
      [{ text: "Посмотреть все материалы", callback_data: `${ALL_PREFIX}${category}` }],
      [{ text: "Назад в главное меню", callback_data: MAIN_MENU_ACTION }],
    ],
  };
}

function predictionBallButtons(category: string) {
  return category === "life"
    ? [[{ text: "🔮 Шар предсказаний", callback_data: BALL_OPEN_ACTION }]]
    : [];
}

async function ensureLibraryLead(
  message: TelegramPrivateTextMessage,
  expertProfile: ExpertProfileRow,
  existingLead: LeadRow | null,
) {
  if (existingLead) {
    await recordUserActivity(existingLead.id);
    return (
      (await updateLeadById(existingLead.id, {
        telegramChatId: message.telegramChatId,
        telegramUsername: message.telegramUsername,
        firstName: message.firstName,
        lastName: message.lastName,
        lastUserMessage: message.text,
      })) ?? existingLead
    );
  }

  const lead = await createLead({
    expertProfileId: expertProfile.id,
    telegramUserId: message.telegramUserId,
    telegramChatId: message.telegramChatId,
    telegramUsername: message.telegramUsername,
    firstName: message.firstName,
    lastName: message.lastName,
    source: "telegram",
    status: "active",
    currentStage: "ecosystem_menu",
    matchedOffer: null,
    lastUserMessage: message.text,
    warmthLevel: "cold",
    giftLinkClickedAt: null,
    giftFollowupDueAt: null,
    giftFollowupSentAt: null,
  });
  await recordUserActivity(lead.id);
  return lead;
}

async function storeIncoming(message: TelegramPrivateTextMessage, lead: LeadRow, expertProfileId: string) {
  await insertMessage({
    leadId: lead.id,
    expertProfileId,
    direction: "incoming",
    channel: "telegram",
    telegramMessageId: message.telegramMessageId,
    text: message.text,
    messageType: "user",
  });
}

async function sendAndStore(
  chatId: number,
  lead: LeadRow,
  expertProfileId: string,
  text: string,
  markup?: Parameters<typeof sendTextMessage>[2],
) {
  const results = await sendTextMessages(chatId, text, withMainMenu(markup));
  for (const result of results) {
    await insertMessage({
      leadId: lead.id,
      expertProfileId,
      direction: "outgoing",
      channel: "telegram",
      telegramMessageId: result.telegramMessageId,
      text: result.text,
      messageType: "ai_reply",
    });
  }
}

async function showMainMenu(message: TelegramPrivateTextMessage, lead: LeadRow, expertProfileId: string, baseUrl: string) {
  await sendAndStore(
    message.telegramChatId,
    lead,
    expertProfileId,
    [
      "**Привет! Ты в Neiroclozer — AI-навигаторе по экосистеме Александра.**",
      "",
      "Наша задача — помочь тебе не просто попробовать AI, а найти, где он реально улучшит жизнь, работу или бизнес: сэкономит время, уберёт рутину и покажет новые точки роста.",
      "",
      "Напиши своими словами, что хочешь улучшить — подберу, с чего начать. Или выбери направление:",
    ].join("\n"),
    mainMenuMarkup(baseUrl),
  );
}

function statusIcon(status: "not_started" | "opened" | "completed" | undefined) {
  if (status === "completed") return "✅";
  if (status === "opened") return "◐";
  return "○";
}

async function showAllMaterials(
  message: TelegramPrivateTextMessage,
  lead: LeadRow,
  expertProfileId: string,
  category: string,
  currentProgress?: CategoryProgress,
) {
  const progress = currentProgress ?? await getCategoryProgress(lead.id, category);

  if (!progress.total) {
    await sendAndStore(
      message.telegramChatId,
      lead,
      expertProfileId,
      `В категории «${getLibraryCategoryLabel(category)}» пока нет активных материалов.`,
      { inline_keyboard: [...predictionBallButtons(category), [{ text: "Назад в главное меню", callback_data: MAIN_MENU_ACTION }]] },
    );
    return;
  }

  for (let index = 0; index < progress.materials.length; index += MATERIALS_PER_MESSAGE) {
    const chunk = progress.materials.slice(index, index + MATERIALS_PER_MESSAGE);
    const isFirst = index === 0;
    const isLast = index + MATERIALS_PER_MESSAGE >= progress.materials.length;
    const text = isFirst
      ? `**${getLibraryCategoryLabel(category)}**\n\nИзучено ${progress.completed} из ${progress.total}`
      : `Материалы ${index + 1}–${index + chunk.length}`;
    const buttons = chunk.map((material) => [
      {
        text: `${statusIcon(progress.statuses.get(material.id))} ${material.title}`.slice(0, 60),
        callback_data: `${MATERIAL_PREFIX}${material.id}`,
      },
    ]);
    if (isFirst) buttons.unshift(...predictionBallButtons(category));
    if (isLast) buttons.push([{ text: "Назад в главное меню", callback_data: MAIN_MENU_ACTION }]);
    await sendAndStore(message.telegramChatId, lead, expertProfileId, text, { inline_keyboard: buttons });
  }
}

async function showMaterial(
  message: TelegramPrivateTextMessage,
  lead: LeadRow,
  expertProfileId: string,
  material: LibraryMaterialRow,
  publicBaseUrl: string,
) {
  await markMaterialOpened(lead.id, material, { refreshProfile: false });
  const progress = await getCategoryProgress(lead.id, material.category);
  await trackUserEvent({
    userId: lead.id,
    eventName: "material_presented",
    materialId: material.id,
    category: material.category,
    metadata: {
      route: material.category,
      slug: material.slug,
      title: material.title,
      topic: material.topic,
      status: progress.statuses.get(material.id) ?? null,
    },
  });
  await refreshLibraryUserProfile(lead.id);
  if (progress.statuses.get(material.id) !== "opened") await cancelLibraryFollowup(lead.id);

  const trackedUrl = new URL("/api/library/open", publicBaseUrl);
  trackedUrl.searchParams.set("token", createLibraryToken({
    userId: lead.id,
    materialId: material.id,
    category: material.category,
    slug: material.slug,
  }, 30 * 24 * 60 * 60));

  await sendAndStore(
    message.telegramChatId,
    lead,
    expertProfileId,
    `${formatMaterialCard(material, { detailed: true, completed: progress.statuses.get(material.id) === "completed" })}\n\nОткрой материал, затем вернись сюда и отметь его прочитанным.\n\nИзучено ${progress.completed} из ${progress.total}`,
    {
      inline_keyboard: [
        [{ text: "Открыть материал", url: trackedUrl.toString() }],
        [{ text: "✅ Я прочитал", callback_data: `${COMPLETE_PREFIX}${material.id}` }],
        [{ text: "💬 Помоги применить", callback_data: `lib:help:${material.id}` }, { text: "✨ Применил", callback_data: `lib:applied:${material.id}` }],
        [{ text: "Не подходит · другой шаг", callback_data: `lib:skip:${material.id}` }],
        [{ text: "➡️ Следующий материал", callback_data: `${NEXT_PREFIX}${material.id}` }],
        [{ text: "↩️ Назад в библиотеку", callback_data: `${ALL_PREFIX}${material.category}` }],
      ],
    },
  );
}

export async function handleLibraryTelegramAction(input: {
  message: TelegramPrivateTextMessage;
  expertProfile: ExpertProfileRow;
  existingLead: LeadRow | null;
  publicBaseUrl: string;
}): Promise<LibraryTelegramResult> {
  if (isPredictionBallAction(input.message)) {
    const lead = await ensureLibraryLead(input.message, input.expertProfile, input.existingLead);
    await handlePredictionBall(input.message, lead.id);
    return { handled: true, startMarketing: false, lead };
  }
  if (!isLibraryEnabled()) return { handled: false, startMarketing: false };

  const { message, expertProfile } = input;
  const isStart = /^\/start(?:@[a-z0-9_]+)?$/i.test(message.text.trim());
  const isLibraryAction =
    message.text === MAIN_MENU_ACTION ||
    message.text === MARKETING_ACTION ||
    message.text.startsWith(CATEGORY_PREFIX) ||
    message.text.startsWith(CONTINUE_PREFIX) ||
    message.text.startsWith(ALL_PREFIX) ||
    message.text.startsWith(MATERIAL_PREFIX) ||
    message.text.startsWith(COMPLETE_PREFIX) ||
    message.text.startsWith(NEXT_PREFIX);
  const reminderAction = message.callbackQueryId && ["lib:reminders:off", "lib:reminders:on"].includes(message.text);
  const journeyAction = message.callbackQueryId && /^(?:lib:route$|lib:(?:help|skip|applied):)/.test(message.text);

  if (!isStart && !isLibraryAction && !reminderAction && !journeyAction) return { handled: false, startMarketing: false };

  const lead = await ensureLibraryLead(message, expertProfile, input.existingLead);
  if (lead.current_stage === "audit_request_requested" && (isStart || journeyAction || message.text === MAIN_MENU_ACTION || message.text.startsWith(CATEGORY_PREFIX))) {
    await updateLeadById(lead.id, { currentStage: "ecosystem_menu" });
  }

  if (reminderAction) {
    const enabled = message.text.endsWith(":on");
    await upsertUserLibraryProfile(lead.id, { reminders_enabled: enabled, next_followup_due_at: null });
    if (enabled) await scheduleNextStepFollowup(lead.id);
    await sendAndStore(message.telegramChatId, lead, expertProfile.id, enabled ? "Напоминания включены." : "Напоминания выключены. Продолжить можно в любой момент через /start.", {
      inline_keyboard: [[{ text: enabled ? "Выключить напоминания" : "Включить напоминания", callback_data: enabled ? "lib:reminders:off" : "lib:reminders:on" }]],
    });
    return { handled: true, startMarketing: false, lead };
  }

  if (message.text === MARKETING_ACTION) {
    await setConversationRoute(lead.id, "marketing");
    await trackUserEvent({ userId: lead.id, eventName: "marketing_selected" });
    return { handled: false, startMarketing: true, lead };
  }

  await storeIncoming(message, lead, expertProfile.id);

  if (journeyAction) {
    if (message.text === "lib:route") {
      const state = await getLibraryJourneyState(lead.id);
      const track = getJourneyTrack(state);
      await sendAndStore(message.telegramChatId, lead, expertProfile.id,
        ["**Твой маршрут**", state.profile?.journey_goal, ...track.map((material, i) => `${i + 1}. ${statusIcon(state.statuses.get(material.id) as "completed" | "opened" | undefined)} ${material.title}`),
          track.length ? "Можно открыть любой шаг или написать, что хочется изменить." : "Подходящего следующего шага пока нет. Расскажи, что хочешь решить — подберём маршрут."].filter(Boolean).join("\n\n"),
        { inline_keyboard: track.map(material => [{ text: material.title.slice(0, 60), callback_data: `${MATERIAL_PREFIX}${material.id}` }]) });
    } else {
      const [, action, id] = message.text.split(":");
      const material = await getMaterialById(id);
      if (!material?.is_active) {
        await sendAndStore(message.telegramChatId, lead, expertProfile.id, "Этот материал больше не доступен. Выбери другой в библиотеке.");
        return { handled: true, startMarketing: false, lead };
      }
      const profile = await getLibraryUserProfile(lead.id);
      const feedback: MaterialFeedback = action === "skip" ? "not_relevant" : action === "applied" ? "applied" : "needs_help";
      const entries = Object.entries(profile?.material_feedback ?? {}).filter(([key]) => key !== id);
      await upsertUserLibraryProfile(lead.id, {
        material_feedback: Object.fromEntries([...entries, [id, feedback]].slice(-20)),
        last_material_slug: material.slug, last_material_title: material.title,
        last_category: material.category === "life" ? "life" : "business", last_route: material.category === "life" ? "life" : "business",
        ...(action === "skip" ? { recommended_material_ids: (profile?.recommended_material_ids ?? []).filter(value => value !== id) } : {}),
      });
      if (action === "help") {
        const reply = await buildContextualLibraryReply(lead.id, `Помоги применить материал «${material.title}» к моей задаче. С чего начать?`);
        await sendDialogueReply(message, lead, expertProfile.id, reply);
      } else if (action === "skip") {
        const next = await getNextRecommendedMaterial(lead.id);
        await sendAndStore(message.telegramChatId, lead, expertProfile.id,
          "Учту: этот материал сейчас не подходит. Что хотелось бы получить вместо него?",
          { inline_keyboard: next ? [[{ text: "Посмотреть другой шаг", callback_data: `${MATERIAL_PREFIX}${next.id}` }]] : [] });
      } else {
        await sendAndStore(message.telegramChatId, lead, expertProfile.id, "Здорово, сохранил отметку о применении. Что получилось и что хочется улучшить?", {
          inline_keyboard: [[{ text: "💬 Разобрать результат", callback_data: `lib:help:${material.id}` }], [{ text: "Мой маршрут", callback_data: "lib:route" }]],
        });
      }
      await scheduleNextStepFollowup(lead.id);
    }
    return { handled: true, startMarketing: false, lead };
  }

  if (isStart || message.text === MAIN_MENU_ACTION) {
    await trackUserEvent({
      userId: lead.id,
      eventName: message.text === MAIN_MENU_ACTION ? "library_returned" : "library_opened",
      metadata: { source: "telegram" },
    });
    await showMainMenu(message, lead, expertProfile.id, input.publicBaseUrl);
    return { handled: true, startMarketing: false, lead };
  }

  if (message.text.startsWith(CATEGORY_PREFIX)) {
    const category = message.text.slice(CATEGORY_PREFIX.length);
    if (!getLibraryCategory(category)) return { handled: true, startMarketing: false, lead };
    const progress = await getCategoryProgress(lead.id, category);
    await trackUserEvent({ userId: lead.id, eventName: "library_opened", category });
    await trackUserEvent({
      userId: lead.id,
      eventName: "category_selected",
      category,
      metadata: { route: category },
    });
    await refreshLibraryUserProfile(lead.id);
    await scheduleNextStepFollowup(lead.id);

    if (progress.completed > 0 || progress.opened > 0) {
      await sendAndStore(
        message.telegramChatId,
        lead,
        expertProfile.id,
        `Ты уже прошёл ${progress.completed} из ${progress.total} материалов. Продолжить?`,
        categoryNavigationMarkup(category),
      );
    } else {
      await showAllMaterials(message, lead, expertProfile.id, category, progress);
    }
    return { handled: true, startMarketing: false, lead };
  }

  if (message.text.startsWith(CONTINUE_PREFIX)) {
    const category = message.text.slice(CONTINUE_PREFIX.length);
    if (!getLibraryCategory(category)) return { handled: true, startMarketing: false, lead };
    const material = await getNextRecommendedMaterial(lead.id, category);
    if (material) await showMaterial(message, lead, expertProfile.id, material, input.publicBaseUrl);
    else {
      await sendAndStore(
        message.telegramChatId,
        lead,
        expertProfile.id,
        "В текущем маршруте нет следующего материала этого направления. Можно вернуться к практике изученного или написать новую задачу.",
        { inline_keyboard: [[{ text: "Назад в главное меню", callback_data: MAIN_MENU_ACTION }]] },
      );
    }
    return { handled: true, startMarketing: false, lead };
  }

  if (message.text.startsWith(ALL_PREFIX)) {
    const category = message.text.slice(ALL_PREFIX.length);
    if (getLibraryCategory(category)) await showAllMaterials(message, lead, expertProfile.id, category);
    return { handled: true, startMarketing: false, lead };
  }

  if (message.text.startsWith(COMPLETE_PREFIX)) {
    const material = await getMaterialById(message.text.slice(COMPLETE_PREFIX.length));

    if (material?.is_active) {
      const progress = await markMaterialCompleted(lead.id, material);
      const rewardUnlocked = await unlockCategoryReward(lead.id, progress);
      const nextMaterial = await getNextMaterialAfter(lead.id, material, progress);
      const buttons = [];
      buttons.push([{ text: "💬 Помоги применить", callback_data: `lib:help:${material.id}` }]);
      if (nextMaterial) {
        buttons.push([
          { text: "➡️ Следующий материал", callback_data: `${NEXT_PREFIX}${material.id}` },
        ]);
      }
      buttons.push([
        { text: "↩️ Назад в библиотеку", callback_data: `${ALL_PREFIX}${material.category}` },
      ]);
      await sendAndStore(
        message.telegramChatId,
        lead,
        expertProfile.id,
        [
          "Готово — материал отмечен как изученный.",
          `Изучено ${progress.completed} из ${progress.total}.`,
          rewardUnlocked ? "Дополнительный бонус открыт." : "",
        ]
          .filter(Boolean)
          .join("\n\n"),
        { inline_keyboard: buttons },
      );
    }
    return { handled: true, startMarketing: false, lead };
  }

  if (message.text.startsWith(NEXT_PREFIX)) {
    const currentMaterial = await getMaterialById(message.text.slice(NEXT_PREFIX.length));

    if (currentMaterial?.is_active) {
      const nextMaterial = await getNextMaterialAfter(lead.id, currentMaterial);

      if (nextMaterial) {
        await trackUserEvent({
          userId: lead.id,
          eventName: "next_material_clicked",
          materialId: nextMaterial.id,
          category: nextMaterial.category,
          metadata: { from_material_id: currentMaterial.id },
        });
        await showMaterial(message, lead, expertProfile.id, nextMaterial, input.publicBaseUrl);
      } else {
        await sendAndStore(
          message.telegramChatId,
          lead,
          expertProfile.id,
          "Дальше активных материалов пока нет.",
          {
            inline_keyboard: [
              [{ text: "↩️ Назад в библиотеку", callback_data: `${ALL_PREFIX}${currentMaterial.category}` }],
            ],
          },
        );
      }
    }
    return { handled: true, startMarketing: false, lead };
  }

  if (message.text.startsWith(MATERIAL_PREFIX)) {
    const material = await getMaterialById(message.text.slice(MATERIAL_PREFIX.length));
    if (material?.is_active) await showMaterial(message, lead, expertProfile.id, material, input.publicBaseUrl);
    return { handled: true, startMarketing: false, lead };
  }

  return { handled: false, startMarketing: false, lead };
}

export async function handleLibraryContextMessage(input: {
  message: TelegramPrivateTextMessage;
  expertProfile: ExpertProfileRow;
  existingLead: LeadRow | null;
  marketingFlowActive: boolean;
}) {
  if (!isLibraryEnabled() || input.message.callbackQueryId || input.message.text.startsWith("/")) return false;

  const profile = input.existingLead ? await getLibraryUserProfile(input.existingLead.id) : null;
  const afterHandoff = input.existingLead?.current_stage === "handoff" && !input.message.document;
  if (input.marketingFlowActive && !afterHandoff && profile?.last_route !== "life" && profile?.last_route !== "business") {
    return false;
  }

  const lead = await ensureLibraryLead(input.message, input.expertProfile, input.existingLead);
  await storeIncoming(input.message, lead, input.expertProfile.id);
  const reply = await buildContextualLibraryReply(lead.id, input.message.text);
  if (reply.route) await rememberLibraryUserMessage(lead.id, reply.route, input.message.text);
  const reminderScheduled = reply.reminderRequested
    ? await scheduleRequestedLibraryReminder(lead.id)
    : false;
  const responseText =
    reply.reminderRequested && !reminderScheduled
      ? "Сейчас автоматические напоминания выключены. Материал останется в твоём прогрессе — к нему можно вернуться через библиотеку в любой момент."
      : reply.text;

  await sendDialogueReply(input.message, lead, input.expertProfile.id, { ...reply, text: responseText });
  if (!reply.reminderRequested) await scheduleNextStepFollowup(lead.id);
  return true;
}

async function sendDialogueReply(message: TelegramPrivateTextMessage, lead: LeadRow, expertId: string, reply: Awaited<ReturnType<typeof buildContextualLibraryReply>>) {
  const buttons = [];
  for (const [index, material] of reply.suggestedMaterials.entries()) {
    buttons.push([
      {
        text: `${index + 1}. ${material.title}`.slice(0, 60),
        callback_data: `${MATERIAL_PREFIX}${material.id}`,
      },
    ]);
  }
  for (const material of reply.revisitMaterials) {
    buttons.push([{ text: `↩ Практика: ${material.title}`.slice(0, 60), callback_data: `${MATERIAL_PREFIX}${material.id}` }]);
  }
  if (!reply.suggestedMaterials.length && !reply.revisitMaterials.length) {
    const next = await getNextRecommendedMaterial(lead.id);
    if (next) buttons.push([{ text: `Продолжить: ${next.title}`.slice(0, 60), callback_data: `${MATERIAL_PREFIX}${next.id}` }]);
  }
  buttons.push([{ text: "🧭 Мой маршрут", callback_data: "lib:route" }]);
  buttons.push([{ text: "Назад в главное меню", callback_data: MAIN_MENU_ACTION }]);
  const cards = [...reply.suggestedMaterials.map(material => formatMaterialCard(material)), ...reply.revisitMaterials.map(material => formatMaterialCard(material, { completed: true }))];
  await sendAndStore(message.telegramChatId, lead, expertId, [reply.text, ...cards].join("\n\n"), {
    inline_keyboard: buttons,
  });
}
