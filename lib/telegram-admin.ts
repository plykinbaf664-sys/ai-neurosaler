import {
  getAdminLeads,
  getAdminOverview,
  getLeadDialogue,
  getRecentLeadDialogues,
  getRuntimeSettings,
  updateRuntimeSettings,
} from "@/lib/data-store";
import { sendDocument, sendTextMessage, type TelegramPrivateTextMessage } from "@/lib/telegram";

const ADMIN_PREFIX = "admin:";

function getAdminUserId() {
  const value = Number(process.env.TELEGRAM_ADMIN_USER_ID);
  return Number.isSafeInteger(value) ? value : null;
}

function menuMarkup() {
  return {
    inline_keyboard: [
      [
        { text: "📊 Статистика", callback_data: "admin:stats" },
        { text: "📁 Лиды CSV", callback_data: "admin:leads" },
      ],
      [
        { text: "💬 Диалоги", callback_data: "admin:dialogs" },
        { text: "⚙️ Настройки", callback_data: "admin:settings" },
      ],
    ],
  };
}

function backMarkup() {
  return { inline_keyboard: [[{ text: "← Меню", callback_data: "admin:menu" }]] };
}

function leadLabel(lead: { telegram_username: string | null; first_name: string | null; telegram_user_id: number }) {
  return lead.telegram_username ? `@${lead.telegram_username}` : lead.first_name || String(lead.telegram_user_id);
}

function csvCell(value: unknown) {
  const text = value === null || value === undefined ? "" : String(value);
  return `"${text.replaceAll('"', '""')}"`;
}

async function showMenu(chatId: number) {
  await sendTextMessage(chatId, "**Админка NeuroSeller**\n\nВыберите раздел:", menuMarkup());
}

async function showStats(chatId: number) {
  const stats = await getAdminOverview();
  await sendTextMessage(
    chatId,
    [
      "**Статистика**",
      "",
      `Лидов всего: ${stats.totalLeads}`,
      `Новых за 24 часа: ${stats.leadsToday}`,
      `Новых за 7 дней: ${stats.leadsWeek}`,
      `Квалифицировано: ${stats.qualified} (${stats.qualificationRate}%)`,
      `Конверсий в передачу/запись: ${stats.converted} (${stats.conversionRate}%)`,
      `Диалогов: ${stats.dialogues}`,
      `Сообщений: ${stats.incomingMessages} входящих / ${stats.outgoingMessages} исходящих`,
    ].join("\n"),
    backMarkup(),
  );
}

async function exportLeads(chatId: number) {
  const leads = await getAdminLeads();
  const header = [
    "telegram_username",
    "telegram_user_id",
    "first_name",
    "last_name",
    "status",
    "stage",
    "warmth",
    "matched_offer",
    "messages",
    "last_message",
    "created_at",
    "updated_at",
  ];
  const rows = leads.map((lead) =>
    [
      lead.telegram_username ? `@${lead.telegram_username}` : "",
      lead.telegram_user_id,
      lead.first_name,
      lead.last_name,
      lead.status,
      lead.current_stage,
      lead.warmth_level,
      lead.matched_offer,
      lead.messageCount,
      lead.last_user_message,
      lead.created_at,
      lead.updated_at,
    ]
      .map(csvCell)
      .join(","),
  );
  const date = new Date().toISOString().slice(0, 10);
  await sendDocument(chatId, `\uFEFF${header.join(",")}\n${rows.join("\n")}\n`, `neuroseller-leads-${date}.csv`, `Лидов: ${leads.length}`);
}

async function showDialogues(chatId: number) {
  const leads = await getRecentLeadDialogues();

  if (!leads.length) {
    await sendTextMessage(chatId, "Диалогов пока нет.", backMarkup());
    return;
  }

  await sendTextMessage(chatId, "**Последние диалоги**", {
    inline_keyboard: [
      ...leads.map((lead) => [
        {
          text: `${leadLabel(lead)} · ${lead.messageCount}`.slice(0, 60),
          callback_data: `admin:dialog:${lead.id}`,
        },
      ]),
      [{ text: "← Меню", callback_data: "admin:menu" }],
    ],
  });
}

async function showDialogue(chatId: number, leadId: string) {
  const { lead, messages } = await getLeadDialogue(leadId);

  if (!lead) {
    await sendTextMessage(chatId, "Лид не найден.", backMarkup());
    return;
  }

  const lines = messages.map((message) => {
    const author = message.direction === "incoming" ? "👤" : "🤖";
    const text = message.text.replace(/\s+/g, " ").slice(0, 500);
    return `${author} ${text}`;
  });
  await sendTextMessage(
    chatId,
    [`**${leadLabel(lead)}**`, `Статус: ${lead.status} · ${lead.current_stage}`, "", ...lines].join("\n\n"),
    { inline_keyboard: [[{ text: "← Диалоги", callback_data: "admin:dialogs" }]] },
  );
}

async function showSettings(chatId: number) {
  const settings = await getRuntimeSettings();
  await sendTextMessage(
    chatId,
    [
      "**Настройки**",
      "",
      `Стартовый сценарий: ${settings.entryFlowMode}`,
      `Gift follow-up: ${settings.giftFollowupsEnabled ? "включён" : "выключен"}`,
    ].join("\n"),
    {
      inline_keyboard: [
        [
          { text: `${settings.entryFlowMode === "quiz" ? "✓ " : ""}Quiz`, callback_data: "admin:mode:quiz" },
          { text: `${settings.entryFlowMode === "gift" ? "✓ " : ""}Gift`, callback_data: "admin:mode:gift" },
        ],
        [
          {
            text: settings.giftFollowupsEnabled ? "Выключить follow-up" : "Включить follow-up",
            callback_data: `admin:followups:${settings.giftFollowupsEnabled ? "off" : "on"}`,
          },
        ],
        [{ text: "← Меню", callback_data: "admin:menu" }],
      ],
    },
  );
}

export async function handleTelegramAdminMessage(message: TelegramPrivateTextMessage) {
  const isAdminAction = message.text === "/admin" || message.text.startsWith(ADMIN_PREFIX);

  if (!isAdminAction) {
    return false;
  }

  const adminUserId = getAdminUserId();

  if (!adminUserId || message.telegramUserId !== adminUserId) {
    await sendTextMessage(message.telegramChatId, "Нет доступа.");
    return true;
  }

  const action = message.text === "/admin" ? "admin:menu" : message.text;

  if (action === "admin:menu") await showMenu(message.telegramChatId);
  else if (action === "admin:stats") await showStats(message.telegramChatId);
  else if (action === "admin:leads") await exportLeads(message.telegramChatId);
  else if (action === "admin:dialogs") await showDialogues(message.telegramChatId);
  else if (action === "admin:settings") await showSettings(message.telegramChatId);
  else if (action === "admin:mode:quiz" || action === "admin:mode:gift") {
    await updateRuntimeSettings({ entryFlowMode: action.endsWith("gift") ? "gift" : "quiz" });
    await showSettings(message.telegramChatId);
  } else if (action === "admin:followups:on" || action === "admin:followups:off") {
    await updateRuntimeSettings({ giftFollowupsEnabled: action.endsWith("on") });
    await showSettings(message.telegramChatId);
  } else if (action.startsWith("admin:dialog:")) {
    await showDialogue(message.telegramChatId, action.slice("admin:dialog:".length));
  } else {
    await showMenu(message.telegramChatId);
  }

  return true;
}
