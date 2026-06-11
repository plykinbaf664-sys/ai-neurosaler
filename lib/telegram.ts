type TelegramUser = {
  id: number;
  username?: string;
  first_name?: string;
  last_name?: string;
};

type TelegramChat = {
  id: number;
  type: string;
};

type TelegramMessage = {
  message_id: number;
  from?: TelegramUser;
  chat: TelegramChat;
  text?: string;
  caption?: string;
  document?: TelegramDocument;
};

type TelegramDocument = {
  file_id: string;
  file_unique_id?: string;
  file_name?: string;
  mime_type?: string;
  file_size?: number;
};

type TelegramUpdate = {
  message?: TelegramMessage;
  callback_query?: {
    id: string;
    from: TelegramUser;
    message?: TelegramMessage;
    data?: string;
  };
};

export type TelegramPrivateTextMessage = {
  telegramUserId: number;
  telegramChatId: number;
  telegramUsername: string | null;
  firstName: string | null;
  lastName: string | null;
  text: string;
  telegramMessageId: number;
  callbackQueryId?: string;
  document?: {
    fileId: string;
    fileName: string | null;
    mimeType: string | null;
    fileSize: number | null;
  };
};

type TelegramSendMessageResponse = {
  ok: boolean;
  result?: {
    message_id: number;
    text?: string;
  };
  description?: string;
};

type TelegramGetFileResponse = {
  ok: boolean;
  result?: {
    file_id: string;
    file_unique_id: string;
    file_size?: number;
    file_path?: string;
  };
  description?: string;
};

type TelegramReplyMarkup = {
  keyboard?: string[][];
  inline_keyboard?: {
    text: string;
    callback_data: string;
  }[][];
  resize_keyboard?: boolean;
  one_time_keyboard?: boolean;
};

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function convertMarkdownToTelegramHtml(text: string) {
  const codeBlocks: string[] = [];
  const withPlaceholders = text.replace(/```([\s\S]*?)```/g, (_, code: string) => {
    const placeholder = `__CODE_BLOCK_${codeBlocks.length}__`;
    codeBlocks.push(`<pre>${escapeHtml(code.trim())}</pre>`);
    return placeholder;
  });

  let formatted = escapeHtml(withPlaceholders);

  formatted = formatted.replace(
    /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g,
    (_, label: string, url: string) => `<a href="${escapeHtml(url)}">${label}</a>`,
  );
  formatted = formatted.replace(/\*\*([^*]+)\*\*/g, "<b>$1</b>");
  formatted = formatted.replace(/(^|\W)\*([^*\n]+)\*(?=\W|$)/g, "$1<i>$2</i>");
  formatted = formatted.replace(/`([^`\n]+)`/g, "<code>$1</code>");

  return codeBlocks.reduce(
    (result, block, index) => result.replace(`__CODE_BLOCK_${index}__`, block),
    formatted,
  );
}

function getTelegramBotToken() {
  const token = process.env.TELEGRAM_BOT_TOKEN;

  if (!token) {
    throw new Error("Missing TELEGRAM_BOT_TOKEN.");
  }

  return token;
}

export async function verifyTelegramWebhookSecret(request: Request) {
  const expectedSecret = process.env.TELEGRAM_WEBHOOK_SECRET;

  if (!expectedSecret) {
    return true;
  }

  return request.headers.get("x-telegram-bot-api-secret-token") === expectedSecret;
}

export function parseTelegramPrivateTextMessage(update: TelegramUpdate): TelegramPrivateTextMessage | null {
  const callbackQuery = update.callback_query;

  if (callbackQuery?.message?.chat.type === "private" && typeof callbackQuery.data === "string") {
    const text = callbackQuery.data.trim();

    if (!text) {
      return null;
    }

    return {
      telegramUserId: callbackQuery.from.id,
      telegramChatId: callbackQuery.message.chat.id,
      telegramUsername: callbackQuery.from.username ?? null,
      firstName: callbackQuery.from.first_name ?? null,
      lastName: callbackQuery.from.last_name ?? null,
      text,
      telegramMessageId: callbackQuery.message.message_id,
      callbackQueryId: callbackQuery.id,
    };
  }

  const message = update.message;

  if (!message || message.chat.type !== "private") {
    return null;
  }

  const sender = message.from;

  if (!sender) {
    return null;
  }

  const text = (message.text ?? message.caption ?? message.document?.file_name ?? "[document]").trim();

  if (!text) {
    return null;
  }

  return {
    telegramUserId: sender.id,
    telegramChatId: message.chat.id,
    telegramUsername: sender.username ?? null,
    firstName: sender.first_name ?? null,
    lastName: sender.last_name ?? null,
    text,
    telegramMessageId: message.message_id,
    document: message.document
      ? {
          fileId: message.document.file_id,
          fileName: message.document.file_name ?? null,
          mimeType: message.document.mime_type ?? null,
          fileSize: message.document.file_size ?? null,
        }
      : undefined,
  };
}

export async function getTelegramFileDownloadUrl(fileId: string) {
  const token = getTelegramBotToken();
  const response = await fetch(`https://api.telegram.org/bot${token}/getFile`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      file_id: fileId,
    }),
  });

  const data = (await response.json()) as TelegramGetFileResponse;

  if (!response.ok || !data.ok || !data.result?.file_path) {
    throw new Error(data.description || "Telegram getFile failed.");
  }

  return `https://api.telegram.org/file/bot${token}/${data.result.file_path}`;
}

export async function answerCallbackQuery(callbackQueryId: string) {
  const response = await fetch(`https://api.telegram.org/bot${getTelegramBotToken()}/answerCallbackQuery`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      callback_query_id: callbackQueryId,
    }),
  });

  const data = (await response.json()) as TelegramSendMessageResponse;

  if (!response.ok || !data.ok) {
    throw new Error(data.description || "Telegram answerCallbackQuery failed.");
  }
}

export async function sendTextMessage(chatId: number, text: string, replyMarkup?: TelegramReplyMarkup) {
  const formattedText = convertMarkdownToTelegramHtml(text);

  const response = await fetch(`https://api.telegram.org/bot${getTelegramBotToken()}/sendMessage`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      chat_id: chatId,
      text: formattedText,
      parse_mode: "HTML",
      ...(replyMarkup ? { reply_markup: replyMarkup } : {}),
    }),
  });

  const data = (await response.json()) as TelegramSendMessageResponse;

  if (!response.ok || !data.ok || !data.result) {
    throw new Error(data.description || "Telegram sendMessage failed.");
  }

  return {
    telegramMessageId: data.result.message_id,
    text: data.result.text ?? text,
  };
}
