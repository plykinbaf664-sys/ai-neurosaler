import "server-only";

import { randomInt } from "node:crypto";
import { claimPredictionBallSpin } from "@/lib/storage";
import { isLibraryEnabled } from "@/lib/library/config";
import { trackUserEvent } from "@/lib/tracking/events";
import {
  answerCallbackQuery,
  editTextMessage,
  getTelegramBotUsername,
  sendTextMessage,
  type TelegramPrivateTextMessage,
} from "@/lib/telegram";

export const BALL_OPEN_ACTION = "ball:open";
export const BALL_SPIN_ACTION = "ball:spin";
export const BALL_COOLDOWN_TEXT = "Использовать шар можно раз в сутки, иначе духи материи нашлют на тебя зловонный понос";
export const BALL_RESULTS = [
  "Не вариант",
  "Почему бы и да",
  "А что от этого тебе?",
  "Даже не думай",
  "Слабая позиция",
  "Как нехуй делать",
  "Нужно купить новые штаны",
  "Писать сидя удобней для всех",
  "В этом что-то есть",
  "Идея на миллион",
  "Момент истины",
  "Хуёво тоже результат",
  "Рискуй",
] as const;

export function isPredictionBallAction(message: TelegramPrivateTextMessage) {
  return /^\/start(?:@[a-z0-9_]+)?\s+ball$/i.test(message.text.trim()) ||
    Boolean(message.callbackQueryId && [BALL_OPEN_ACTION, BALL_SPIN_ACTION].includes(message.text));
}

function backButton() {
  return { text: "⬅️ Назад", callback_data: isLibraryEnabled() ? "lib:cat:life" : "/start" };
}

export function buildPredictionBallShareUrl(result: string, username: string) {
  const deepLink = `https://t.me/${username}?start=ball`;
  const share = new URL("https://t.me/share/url");
  // Telegram Desktop requires a non-empty URL; clients may prepend it to text.
  share.searchParams.set("url", deepLink);
  share.searchParams.set("text", `🔮 Шар предсказаний сказал мне: «${result}»\nТеперь твоя очередь: ${deepLink}`);
  return share.toString();
}

export async function handlePredictionBall(message: TelegramPrivateTextMessage, userId: string) {
  if (message.text !== BALL_SPIN_ACTION) {
    await trackUserEvent({ userId, eventName: "prediction_ball_opened" });
    await sendTextMessage(message.telegramChatId, [
      "🔮 Шар предсказаний", "",
      "Задай про себя вопрос, на который сейчас хочешь получить ответ.",
      "Не надо ничего писать.",
      "Когда будешь готов — крути шар.", "",
      "Шар можно крутить раз в 24 часа.",
    ].join("\n"), {
      inline_keyboard: [
        [{ text: "🔮 Крутить шар", callback_data: BALL_SPIN_ACTION }],
        [backButton()],
      ],
    });
    return;
  }

  // Resolve sharing before consuming the daily spin. No LLM call is involved.
  const username = await getTelegramBotUsername();
  const result = BALL_RESULTS[randomInt(BALL_RESULTS.length)];
  if (!await claimPredictionBallSpin(userId, result)) {
    await answerCallbackQuery(message.callbackQueryId!, BALL_COOLDOWN_TEXT);
    return;
  }
  await answerCallbackQuery(message.callbackQueryId!).catch(() => undefined);

  // Two frames, one second apart, then the result in the same message.
  // A failed optional frame must not hide the already selected result.
  try {
    for (const frame of ["🔮 ·", "🔮 ✦ ✦ ✦"]) {
      await editTextMessage(message.telegramChatId, message.telegramMessageId, frame);
      await new Promise((resolve) => setTimeout(resolve, 1_000));
    }
  } catch { /* Proceed to the result if Telegram cannot show the animation. */ }

  const text = `🔮 Шар сказал:\n«${result}»`;
  const markup = {
    inline_keyboard: [
      [{ text: "🔮 Ещё раз", callback_data: BALL_SPIN_ACTION }],
      [{ text: "📤 Поделиться", url: buildPredictionBallShareUrl(result, username) }],
      [backButton()],
    ],
  };
  try {
    await editTextMessage(message.telegramChatId, message.telegramMessageId, text, markup);
  } catch {
    // For example, the original message was deleted during the animation.
    await sendTextMessage(message.telegramChatId, text, markup);
  }
}
