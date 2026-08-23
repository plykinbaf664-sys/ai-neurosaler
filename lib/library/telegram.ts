import "server-only";

import {
  createLead,
  insertMessage,
  updateLeadById,
  type ExpertProfileRow,
  type LeadRow,
  type LibraryMaterialRow,
} from "@/lib/storage";
import { LIBRARY_CATEGORIES, getLibraryCategory, getLibraryCategoryLabel, isLibraryEnabled } from "@/lib/library/config";
import { getMaterialById } from "@/lib/library/materials";
import { getCategoryProgress } from "@/lib/library/progress";
import { getNextRecommendedMaterial } from "@/lib/library/recommendations";
import { createLibraryToken } from "@/lib/security/library-token";
import { sendTextMessage, type TelegramPrivateTextMessage } from "@/lib/telegram";
import { trackUserEvent } from "@/lib/tracking/events";

const MAIN_MENU_ACTION = "nav:menu";
const MARKETING_ACTION = "nav:marketing";
const CATEGORY_PREFIX = "lib:cat:";
const CONTINUE_PREFIX = "lib:continue:";
const ALL_PREFIX = "lib:all:";
const MATERIAL_PREFIX = "lib:mat:";
const MATERIALS_PER_MESSAGE = 8;

type LibraryTelegramResult = {
  handled: boolean;
  startMarketing: boolean;
  lead?: LeadRow;
};

function mainMenuMarkup() {
  return {
    inline_keyboard: [
      [{ text: "📊 Разобрать маркетинг", callback_data: MARKETING_ACTION }],
      ...LIBRARY_CATEGORIES.map((category) => [
        { text: category.buttonLabel, callback_data: `${CATEGORY_PREFIX}${category.slug}` },
      ]),
    ],
  };
}

function categoryNavigationMarkup(category: string) {
  return {
    inline_keyboard: [
      [{ text: "Продолжить", callback_data: `${CONTINUE_PREFIX}${category}` }],
      [{ text: "Посмотреть все материалы", callback_data: `${ALL_PREFIX}${category}` }],
      [{ text: "Назад в главное меню", callback_data: MAIN_MENU_ACTION }],
    ],
  };
}

async function ensureLibraryLead(
  message: TelegramPrivateTextMessage,
  expertProfile: ExpertProfileRow,
  existingLead: LeadRow | null,
) {
  if (existingLead) {
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

  return createLead({
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
  const result = await sendTextMessage(chatId, text, markup);
  await insertMessage({
    leadId: lead.id,
    expertProfileId,
    direction: "outgoing",
    channel: "telegram",
    telegramMessageId: result.telegramMessageId,
    text,
    messageType: "ai_reply",
  });
}

async function showMainMenu(message: TelegramPrivateTextMessage, lead: LeadRow, expertProfileId: string) {
  await sendAndStore(
    message.telegramChatId,
    lead,
    expertProfileId,
    [
      "**Привет! Ты в Neiroclozer — AI-навигаторе по экосистеме Александра.**",
      "",
      "Наша задача — помочь тебе не просто попробовать AI, а найти, где он реально улучшит жизнь, работу или бизнес: сэкономит время, уберёт рутину и покажет новые точки роста.",
      "",
      "Выбери, с чего начнём:",
    ].join("\n"),
    mainMenuMarkup(),
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
) {
  const progress = await getCategoryProgress(lead.id, category);

  if (!progress.total) {
    await sendAndStore(
      message.telegramChatId,
      lead,
      expertProfileId,
      `В категории «${getLibraryCategoryLabel(category)}» пока нет активных материалов.`,
      { inline_keyboard: [[{ text: "Назад в главное меню", callback_data: MAIN_MENU_ACTION }]] },
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
  const progress = await getCategoryProgress(lead.id, material.category);
  const token = createLibraryToken({
    userId: lead.id,
    materialId: material.id,
    category: material.category,
    slug: material.slug,
  });
  const openUrl = new URL("/api/library/open", publicBaseUrl);
  openUrl.searchParams.set("token", token);

  await sendAndStore(
    message.telegramChatId,
    lead,
    expertProfileId,
    `**${material.title}**\n\n${material.short_description}\n\nИзучено ${progress.completed} из ${progress.total}`,
    {
      inline_keyboard: [
        [{ text: "Открыть материал", url: openUrl.toString() }],
        [{ text: "Все материалы", callback_data: `${ALL_PREFIX}${material.category}` }],
        [{ text: "Назад в главное меню", callback_data: MAIN_MENU_ACTION }],
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
  if (!isLibraryEnabled()) return { handled: false, startMarketing: false };

  const { message, expertProfile, publicBaseUrl } = input;
  const isStart = message.text.trim().toLowerCase() === "/start";
  const isLibraryAction =
    message.text === MAIN_MENU_ACTION ||
    message.text === MARKETING_ACTION ||
    message.text.startsWith(CATEGORY_PREFIX) ||
    message.text.startsWith(CONTINUE_PREFIX) ||
    message.text.startsWith(ALL_PREFIX) ||
    message.text.startsWith(MATERIAL_PREFIX);

  if (!isStart && !isLibraryAction) return { handled: false, startMarketing: false };

  const lead = await ensureLibraryLead(message, expertProfile, input.existingLead);

  if (message.text === MARKETING_ACTION) {
    return { handled: false, startMarketing: true, lead };
  }

  await storeIncoming(message, lead, expertProfile.id);

  if (isStart || message.text === MAIN_MENU_ACTION) {
    await trackUserEvent({
      userId: lead.id,
      eventName: message.text === MAIN_MENU_ACTION ? "library_returned" : "library_opened",
      metadata: { source: "telegram" },
    });
    await showMainMenu(message, lead, expertProfile.id);
    return { handled: true, startMarketing: false, lead };
  }

  if (message.text.startsWith(CATEGORY_PREFIX)) {
    const category = message.text.slice(CATEGORY_PREFIX.length);
    if (!getLibraryCategory(category)) return { handled: true, startMarketing: false, lead };
    const progress = await getCategoryProgress(lead.id, category);
    await trackUserEvent({ userId: lead.id, eventName: "library_opened", category });
    await trackUserEvent({ userId: lead.id, eventName: "category_selected", category });

    if (progress.completed > 0 || progress.opened > 0) {
      await sendAndStore(
        message.telegramChatId,
        lead,
        expertProfile.id,
        `Ты уже прошёл ${progress.completed} из ${progress.total} материалов. Продолжить?`,
        categoryNavigationMarkup(category),
      );
    } else {
      await showAllMaterials(message, lead, expertProfile.id, category);
    }
    return { handled: true, startMarketing: false, lead };
  }

  if (message.text.startsWith(CONTINUE_PREFIX)) {
    const category = message.text.slice(CONTINUE_PREFIX.length);
    if (!getLibraryCategory(category)) return { handled: true, startMarketing: false, lead };
    const material = await getNextRecommendedMaterial(lead.id, category);
    if (material) await showMaterial(message, lead, expertProfile.id, material, publicBaseUrl);
    else {
      await sendAndStore(
        message.telegramChatId,
        lead,
        expertProfile.id,
        "Все активные материалы изучены. Дополнительный бонус уже открыт.",
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

  if (message.text.startsWith(MATERIAL_PREFIX)) {
    const material = await getMaterialById(message.text.slice(MATERIAL_PREFIX.length));
    if (material?.is_active) await showMaterial(message, lead, expertProfile.id, material, publicBaseUrl);
    return { handled: true, startMarketing: false, lead };
  }

  return { handled: false, startMarketing: false, lead };
}
