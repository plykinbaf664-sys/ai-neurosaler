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
  video_note?: { file_id: string };
  photo?: { file_id: string }[];
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
  videoNoteFileId?: string;
  photoFileId?: string;
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
    callback_data?: string;
    url?: string;
    web_app?: { url: string };
  }[][];
  resize_keyboard?: boolean;
  one_time_keyboard?: boolean;
};

const TELEGRAM_SAFE_CHUNK_LIMIT = 3500;

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

export function convertMarkdownToTelegramHtml(text: string) {
  const codeBlocks: string[] = [];
  const withPlaceholders = text.replace(/```([\s\S]*?)```/g, (_, code: string) => {
    const placeholder = `__CODE_BLOCK_${codeBlocks.length}__`;
    codeBlocks.push(`<pre>${escapeHtml(code.trim())}</pre>`);
    return placeholder;
  });

  const markdownLinks: string[] = [];
  const withLinkPlaceholders = withPlaceholders.replace(
    /\[([^\]]+)\]\((https?:\/\/(?:[^\s()]|\([^\s()]*\))+)\)/g,
    (_, label: string, rawUrl: string) => {
      try {
        const parsedUrl = new URL(rawUrl);
        if (parsedUrl.protocol !== "https:" && parsedUrl.protocol !== "http:") return label;
        const placeholder = `__TELEGRAM_LINK_${markdownLinks.length}__`;
        markdownLinks.push(`<a href="${escapeHtml(parsedUrl.toString())}">${escapeHtml(label)}</a>`);
        return placeholder;
      } catch {
        return label;
      }
    },
  );

  let formatted = escapeHtml(withLinkPlaceholders);
  formatted = formatted.replace(/\*\*([^*]+)\*\*/g, "<b>$1</b>");
  formatted = formatted.replace(/(^|\W)\*([^*\n]+)\*(?=\W|$)/g, "$1<i>$2</i>");
  formatted = formatted.replace(/`([^`\n]+)`/g, "<code>$1</code>");
  markdownLinks.forEach((link, index) => {
    formatted = formatted.replace(`__TELEGRAM_LINK_${index}__`, () => link);
  });

  return codeBlocks.reduce(
    (result, block, index) => result.replace(`__CODE_BLOCK_${index}__`, () => block),
    formatted,
  );
}

function splitTextByBoundaries(text: string, maxLength: number) {
  const normalized = text.trim();

  if (normalized.length <= maxLength) {
    return [normalized];
  }

  const paragraphs = normalized.split(/\n{2,}/);
  const chunks: string[] = [];
  let current = "";

  const pushCurrent = () => {
    const trimmed = current.trim();
    if (trimmed) {
      chunks.push(trimmed);
    }
    current = "";
  };

  for (const paragraph of paragraphs) {
    const candidate = current ? `${current}\n\n${paragraph}` : paragraph;

    if (candidate.length <= maxLength) {
      current = candidate;
      continue;
    }

    pushCurrent();

    if (paragraph.length <= maxLength) {
      current = paragraph;
      continue;
    }

    const sentences = paragraph.match(/[^.!?…]+[.!?…]?/g) ?? [paragraph];
    let sentenceBuffer = "";

    for (const sentence of sentences) {
      const sentenceCandidate = sentenceBuffer ? `${sentenceBuffer} ${sentence}` : sentence;

      if (sentenceCandidate.length <= maxLength) {
        sentenceBuffer = sentenceCandidate;
        continue;
      }

      if (sentenceBuffer) {
        chunks.push(sentenceBuffer.trim());
        sentenceBuffer = "";
      }

      if (sentence.length <= maxLength) {
        sentenceBuffer = sentence;
        continue;
      }

      for (let index = 0; index < sentence.length; index += maxLength) {
        const part = sentence.slice(index, index + maxLength).trim();
        if (part) {
          chunks.push(part);
        }
      }
    }

    current = sentenceBuffer;
  }

  pushCurrent();

  return chunks.length > 0 ? chunks : [normalized.slice(0, maxLength)];
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
    videoNoteFileId: message.video_note?.file_id,
    photoFileId: message.photo?.at(-1)?.file_id,
  };
}

export class TelegramApiError extends Error {
  constructor(public status: number, message: string) { super(message); this.name = "TelegramApiError"; }
}

export async function sendVideoNote(chatId: number, fileId: string) {
  const response = await fetch(`https://api.telegram.org/bot${getTelegramBotToken()}/sendVideoNote`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, video_note: fileId }), signal: AbortSignal.timeout(8_000),
  });
  const data = await response.json() as TelegramSendMessageResponse;
  if (!response.ok || !data.ok || !data.result) throw new TelegramApiError(response.status, data.description || "sendVideoNote failed");
  return data.result.message_id;
}

export async function sendPhoto(chatId: number, photo: string | Uint8Array) {
  const body = new FormData();
  body.set("chat_id", String(chatId));
  if (typeof photo === "string") body.set("photo", photo);
  else body.set("photo", new Blob([new Uint8Array(photo)], { type: "image/png" }), "visual.png");
  const response = await fetch(`https://api.telegram.org/bot${getTelegramBotToken()}/sendPhoto`, {
    method: "POST", body, signal: AbortSignal.timeout(8_000),
  });
  const data = await response.json() as { ok: boolean; result?: { photo?: { file_id: string }[] }; description?: string };
  const fileId = data.result?.photo?.at(-1)?.file_id;
  if (!response.ok || !data.ok || !fileId) throw new TelegramApiError(response.status, data.description || "sendPhoto failed");
  return fileId;
}

export async function captureAdminMedia(message: TelegramPrivateTextMessage) {
  if (message.callbackQueryId || String(message.telegramUserId) !== process.env.ADMIN_TELEGRAM_ID?.trim()) return false;
  const fileId = message.videoNoteFileId ?? message.photoFileId;
  if (!fileId) return false;
  await sendTextMessage(message.telegramChatId, `${message.videoNoteFileId ? "🎬 VIDEO_NOTE_FILE_ID" : "🖼 PHOTO_FILE_ID"}\n\n${fileId}`);
  return true;
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

export async function answerCallbackQuery(callbackQueryId: string, text?: string) {
  const response = await fetch(`https://api.telegram.org/bot${getTelegramBotToken()}/answerCallbackQuery`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      callback_query_id: callbackQueryId,
      ...(text ? { text, show_alert: true } : {}),
    }),
  });

  const data = (await response.json()) as TelegramSendMessageResponse;

  if (!response.ok || !data.ok) {
    throw new Error(data.description || "Telegram answerCallbackQuery failed.");
  }
}

let botUsername: Promise<string> | undefined;

export function getTelegramBotUsername() {
  return botUsername ??= (async () => {
    const response = await fetch(`https://api.telegram.org/bot${getTelegramBotToken()}/getMe`);
    const data = await response.json() as { ok: boolean; result?: { username?: string }; description?: string };
    if (!response.ok || !data.ok || !data.result?.username) {
      throw new Error(data.description || "Telegram getMe failed.");
    }
    return data.result.username;
  })().catch((error) => {
    botUsername = undefined;
    throw error;
  });
}

export async function editTextMessage(chatId: number, messageId: number, text: string, replyMarkup?: TelegramReplyMarkup) {
  for (let attempt = 0; attempt < 2; attempt++) {
    const response = await fetch(`https://api.telegram.org/bot${getTelegramBotToken()}/editMessageText`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        message_id: messageId,
        text: convertMarkdownToTelegramHtml(text),
        parse_mode: "HTML",
        reply_markup: replyMarkup ?? { inline_keyboard: [] },
      }),
    });
    const data = await response.json() as TelegramSendMessageResponse & { parameters?: { retry_after?: number } };
    if ((response.ok && data.ok) || data.description?.includes("message is not modified")) return;
    const retryAfter = data.parameters?.retry_after;
    if (response.status === 429 && attempt === 0 && retryAfter && retryAfter <= 30) {
      await new Promise((resolve) => setTimeout(resolve, retryAfter * 1_000));
      continue;
    }
    throw new Error(data.description || "Telegram editMessageText failed.");
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
    throw new TelegramApiError(response.status, data.description || "Telegram sendMessage failed.");
  }

  return {
    telegramMessageId: data.result.message_id,
    text: data.result.text ?? text,
  };
}

export async function sendTextMessages(chatId: number, text: string, replyMarkup?: TelegramReplyMarkup) {
  const parts = splitTextByBoundaries(text, TELEGRAM_SAFE_CHUNK_LIMIT);
  const results = [];

  for (const [index, part] of parts.entries()) {
    const result = await sendTextMessage(chatId, part, index === parts.length - 1 ? replyMarkup : undefined);
    results.push(result);
  }

  return results;
}

export async function sendDocument(chatId: number, content: string, fileName: string, caption?: string) {
  const formData = new FormData();
  formData.set("chat_id", String(chatId));
  formData.set("document", new Blob([content], { type: "text/csv;charset=utf-8" }), fileName);

  if (caption) {
    formData.set("caption", caption);
  }

  const response = await fetch(`https://api.telegram.org/bot${getTelegramBotToken()}/sendDocument`, {
    method: "POST",
    body: formData,
  });
  const data = (await response.json()) as TelegramSendMessageResponse;

  if (!response.ok || !data.ok || !data.result) {
    throw new Error(data.description || "Telegram sendDocument failed.");
  }

  return { telegramMessageId: data.result.message_id };
}
