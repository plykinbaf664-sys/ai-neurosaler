import {
  createLead,
  getActiveExpertFaq,
  getActiveExpertObjections,
  getActiveExpertOffers,
  getActiveExpertProfile,
  getLeadByTelegramUserId,
  getRecentMessagesByLeadId,
  insertMessage,
  updateLeadById,
} from "@/lib/supabase-rest";
import { buildNeiroPrompt } from "@/lib/neiroclozer/prompt-builder";
import { generateNeiroReply } from "@/lib/neiroclozer/generate-reply";
import {
  buildInvalidMarketingRoiQuizAnswerText,
  buildMarketingRoiQuizVerdict,
  getMarketingRoiQuizKeyboard,
  getMarketingRoiQuizQuestion,
  getNextMarketingRoiQuizStage,
  isMarketingRoiQuizStage,
  MARKETING_ROI_QUIZ_STAGES,
  parseMarketingRoiQuizAnswer,
  type MarketingRoiQuizAnswerKey,
} from "@/lib/neiroclozer/marketing-roi-quiz";
import {
  answerCallbackQuery,
  parseTelegramPrivateTextMessage,
  sendTextMessage,
  verifyTelegramWebhookSecret,
} from "@/lib/telegram";

function buildGiftText(giftMessage: string, giftUrl: string) {
  return `${giftMessage}\n\n${giftUrl}`;
}

const GIFT_FOLLOWUP_DELAY_MS = 15 * 60 * 1000;
const DEFAULT_ENTRY_FLOW_MODE = "quiz";

function getEntryFlowMode() {
  return process.env.NEIRO_ENTRY_FLOW_MODE === "gift" ? "gift" : DEFAULT_ENTRY_FLOW_MODE;
}

function isStartCommand(text: string) {
  return text.trim().toLowerCase() === "/start";
}

function getPublicBaseUrl(request: Request) {
  const envBaseUrl =
    process.env.TELEGRAM_WEBHOOK_BASE_URL ||
    process.env.PUBLIC_BASE_URL ||
    process.env.NEXT_PUBLIC_APP_URL;

  if (envBaseUrl) {
    return envBaseUrl.replace(/\/+$/, "");
  }

  const forwardedHost = request.headers.get("x-forwarded-host");
  const forwardedProto = request.headers.get("x-forwarded-proto");

  if (forwardedHost && forwardedProto) {
    return `${forwardedProto}://${forwardedHost}`.replace(/\/+$/, "");
  }

  const url = new URL(request.url);
  return `${url.protocol}//${url.host}`.replace(/\/+$/, "");
}

function buildTrackedGiftUrl(request: Request, leadId: string, giftUrl: string) {
  const trackedUrl = new URL(`${getPublicBaseUrl(request)}/api/gift/${leadId}`);
  trackedUrl.searchParams.set("redirect", giftUrl);
  return trackedUrl.toString();
}

function getCalendarLink() {
  return process.env.CALENDAR_LINK || "https://calendar.app.google/rpFMG61ce4dXL54z5";
}

function getBookedStage(matchedOffer: string | null, currentStage: string) {
  if (currentStage === "awaiting_expert_call") {
    return "expert_call_confirmed";
  }

  if (matchedOffer === "consulting") {
    return "consulting_booked";
  }

  if (matchedOffer === "done_for_you") {
    return "done_for_you_booked";
  }

  return "diagnostic_booked";
}

async function sendMarketingRoiQuizQuestion(chatId: number, leadId: string, expertProfileId: string, stage: string) {
  const question = getMarketingRoiQuizQuestion(stage);

  if (!question) {
    return null;
  }

  const result = await sendTextMessage(chatId, question.text, getMarketingRoiQuizKeyboard(stage));
  await insertMessage({
    leadId,
    expertProfileId,
    direction: "outgoing",
    channel: "telegram",
    telegramMessageId: result.telegramMessageId,
    text: question.text,
    messageType: "qual_question",
  });

  return result;
}

function extractRecentMarketingRoiQuizAnswers(messages: { direction: string; text: string; created_at: string }[]) {
  return [...messages]
    .sort((a, b) => a.created_at.localeCompare(b.created_at))
    .filter((message) => message.direction === "incoming")
    .map((message) => parseMarketingRoiQuizAnswer(message.text))
    .filter((answer): answer is MarketingRoiQuizAnswerKey => Boolean(answer))
    .slice(-3);
}

function hasAnyKeyword(text: string, keywords: string[]) {
  return keywords.some((keyword) => text.includes(keyword));
}

function detectMatchedOffer(text: string) {
  if (
    hasAnyKeyword(text, [
      "сделайте под ключ",
      "соберите мне",
      "хочу готовую систему",
      "нужно внедрение",
    ])
  ) {
    return "done_for_you";
  }

  if (
    hasAnyKeyword(text, [
      "нужна консультация",
      "нужен совет",
      "хочу понять направление",
    ])
  ) {
    return "consulting";
  }

  if (
    hasAnyKeyword(text, [
      "хочу понять",
      "не понимаю, что делать",
      "нужен разбор",
      "хочу разобраться",
    ])
  ) {
    return "diagnostic";
  }

  return null;
}

function needsManualFollowup(text: string) {
  return hasAnyKeyword(text, [
    "созвон",
    "ручной разбор",
    "обсудить внедрение",
    "готов обсуждать внедрение",
    "как начать работу",
    "начать работу лично",
  ]);
}

function isShortPositiveReply(text: string) {
  const normalized = text.trim().toLowerCase();
  return [
    "да",
    "ага",
    "ок",
    "окей",
    "хорошо",
    "давайте",
    "подходит",
    "готов",
    "согласен",
    "согласна",
  ].includes(normalized);
}

function hasBookedSignal(text: string) {
  return hasAnyKeyword(text, [
    "записался",
    "записалась",
    "забронировал",
    "забронировала",
    "выбрал слот",
    "выбрала слот",
    "назначил созвон",
    "назначила созвон",
    "взял слот",
    "взяла слот",
  ]);
}

function detectWarmthLevel(text: string, matchedOffer: string | null, manualFollowup: boolean) {
  if (
    manualFollowup ||
    hasAnyKeyword(text, [
      "стоимость",
      "цена",
      "сколько стоит",
      "сроки",
      "как начать",
      "подключение",
      "внедрение",
    ])
  ) {
    return "hot";
  }

  if (
    matchedOffer ||
    text.length > 40 ||
    hasAnyKeyword(text, [
      "формат",
      "процесс",
      "как это работает",
      "моя ситуация",
      "у меня",
    ])
  ) {
    return "warm";
  }

  return "cold";
}

function detectLeadStatus(isNewLead: boolean, matchedOffer: string | null, warmthLevel: string, manualFollowup: boolean) {
  if (manualFollowup) {
    return "needs_manual_followup";
  }

  if (matchedOffer && warmthLevel !== "cold") {
    return "qualified";
  }

  if (isNewLead) {
    return "new";
  }

  return "active";
}

function detectFinalMatchedOffer(
  detectedMatchedOffer: string | null,
  existingMatchedOffer: string | null | undefined,
  hasBooked: boolean,
) {
  if (detectedMatchedOffer) {
    return detectedMatchedOffer;
  }

  if (existingMatchedOffer) {
    return existingMatchedOffer;
  }

  if (hasBooked) {
    return "diagnostic";
  }

  return null;
}

function detectCurrentStage(
  matchedOffer: string | null,
  manualFollowup: boolean,
  hasBooked: boolean,
  hasPositiveReply: boolean,
  existingStage: string | null | undefined,
) {
  if (hasBooked) {
    if (manualFollowup) {
      return "expert_call_booked";
    }

    if (matchedOffer === "consulting") {
      return "consulting_booked";
    }

    if (matchedOffer === "done_for_you") {
      return "done_for_you_booked";
    }

    return "diagnostic_booked";
  }

  if (hasPositiveReply && existingStage === "awaiting_expert_call") {
    return "expert_call_confirmed";
  }

  if (manualFollowup) {
    return "awaiting_expert_call";
  }

  if (matchedOffer === "done_for_you") {
    return "qualified_done_for_you";
  }

  if (matchedOffer === "consulting") {
    return "qualified_consulting";
  }

  if (matchedOffer === "diagnostic") {
    return "qualified_diagnostic";
  }

  return existingStage || "qualification_in_progress";
}

export async function POST(request: Request) {
  try {
    const isSecretValid = await verifyTelegramWebhookSecret(request);

    if (!isSecretValid) {
      return Response.json({ ok: false, error: "Invalid Telegram webhook secret." }, { status: 401 });
    }

    const update = (await request.json()) as Parameters<typeof parseTelegramPrivateTextMessage>[0];

    const incomingMessage = parseTelegramPrivateTextMessage(update);

    if (!incomingMessage) {
      return Response.json({ ok: true, ignored: true });
    }

    if (incomingMessage.callbackQueryId) {
      answerCallbackQuery(incomingMessage.callbackQueryId).catch((error) => {
        const message = error instanceof Error ? error.message : "Unknown callback answer error.";
        console.error("Telegram callback answer error:", message);
      });
    }

    const expertProfile = await getActiveExpertProfile();

    if (!expertProfile) {
      return Response.json({ ok: false, error: "Active expert_profile not found." }, { status: 500 });
    }

    const existingLead = await getLeadByTelegramUserId(incomingMessage.telegramUserId);
    const isNewLead = !existingLead;
    const entryFlowMode = getEntryFlowMode();
    const shouldRestartQuiz = Boolean(existingLead && entryFlowMode === "quiz" && isStartCommand(incomingMessage.text));
    const isExistingQuizStage = !shouldRestartQuiz && isMarketingRoiQuizStage(existingLead?.current_stage);
    const normalizedUserText = incomingMessage.text.toLowerCase();
    const hasBooked = hasBookedSignal(normalizedUserText);
    const hasPositiveReply = isShortPositiveReply(normalizedUserText);
    const matchedOffer = shouldRestartQuiz
      ? null
      : isExistingQuizStage
      ? existingLead?.matched_offer ?? null
      : detectFinalMatchedOffer(detectMatchedOffer(normalizedUserText), existingLead?.matched_offer, hasBooked);
    const manualFollowup = needsManualFollowup(normalizedUserText);
    const warmthLevel = detectWarmthLevel(normalizedUserText, matchedOffer, manualFollowup);
    const leadStatus = shouldRestartQuiz
      ? "active"
      : isExistingQuizStage
      ? existingLead?.status ?? "active"
      : hasBooked || (hasPositiveReply && (matchedOffer === "diagnostic" || manualFollowup))
        ? "qualified"
        : detectLeadStatus(isNewLead, matchedOffer, warmthLevel, manualFollowup);
    const currentStage =
      (isNewLead && entryFlowMode === "quiz") || shouldRestartQuiz
        ? MARKETING_ROI_QUIZ_STAGES.question1
        : isExistingQuizStage
          ? existingLead.current_stage
          : detectCurrentStage(
              matchedOffer,
              manualFollowup,
              hasBooked,
              hasPositiveReply,
              existingLead?.current_stage,
            );
    const lead =
      existingLead ??
      (await createLead({
        expertProfileId: expertProfile.id,
        telegramUserId: incomingMessage.telegramUserId,
        telegramChatId: incomingMessage.telegramChatId,
        telegramUsername: incomingMessage.telegramUsername,
        firstName: incomingMessage.firstName,
        lastName: incomingMessage.lastName,
        source: "telegram",
        status: leadStatus,
        currentStage,
        matchedOffer,
        lastUserMessage: incomingMessage.text,
        warmthLevel,
        giftLinkClickedAt: null,
        giftFollowupDueAt:
          entryFlowMode === "gift" ? new Date(Date.now() + GIFT_FOLLOWUP_DELAY_MS).toISOString() : null,
        giftFollowupSentAt: null,
      }));

    const updatedLead =
      (await updateLeadById(lead.id, {
        expertProfileId: expertProfile.id,
        telegramChatId: incomingMessage.telegramChatId,
        telegramUsername: incomingMessage.telegramUsername,
        firstName: incomingMessage.firstName,
        lastName: incomingMessage.lastName,
        source: "telegram",
        status: leadStatus,
        currentStage,
        matchedOffer,
        lastUserMessage: incomingMessage.text,
        warmthLevel,
      })) ?? lead;

    await insertMessage({
      leadId: lead.id,
      expertProfileId: expertProfile.id,
      direction: "incoming",
      channel: "telegram",
      telegramMessageId: incomingMessage.telegramMessageId,
      text: incomingMessage.text,
      messageType: "user",
    });

    if (isNewLead || shouldRestartQuiz) {
      const welcomeResult = await sendTextMessage(incomingMessage.telegramChatId, expertProfile.welcome_message);
      await insertMessage({
        leadId: lead.id,
        expertProfileId: expertProfile.id,
        direction: "outgoing",
        channel: "telegram",
        telegramMessageId: welcomeResult.telegramMessageId,
        text: expertProfile.welcome_message,
        messageType: "welcome",
      });

      if (entryFlowMode === "quiz") {
        await sendMarketingRoiQuizQuestion(
          incomingMessage.telegramChatId,
          lead.id,
          expertProfile.id,
          MARKETING_ROI_QUIZ_STAGES.question1,
        );

        await updateLeadById(lead.id, {
          currentStage: MARKETING_ROI_QUIZ_STAGES.question1,
        });

        return Response.json({ ok: true });
      }

      const trackedGiftUrl = buildTrackedGiftUrl(request, lead.id, expertProfile.gift_url);
      const giftText = buildGiftText(expertProfile.gift_message, trackedGiftUrl);
      const giftResult = await sendTextMessage(incomingMessage.telegramChatId, giftText);
      await insertMessage({
        leadId: lead.id,
        expertProfileId: expertProfile.id,
        direction: "outgoing",
        channel: "telegram",
        telegramMessageId: giftResult.telegramMessageId,
        text: giftText,
        messageType: "gift",
      });

      await updateLeadById(lead.id, {
        currentStage: "gift_sent",
      });

      const questionResult = await sendTextMessage(
        incomingMessage.telegramChatId,
        expertProfile.first_qual_question,
      );
      await insertMessage({
        leadId: lead.id,
        expertProfileId: expertProfile.id,
        direction: "outgoing",
        channel: "telegram",
        telegramMessageId: questionResult.telegramMessageId,
        text: expertProfile.first_qual_question,
        messageType: "qual_question",
      });

      await updateLeadById(lead.id, {
        currentStage: "awaiting_qualification_reply",
      });
    } else if (isExistingQuizStage) {
      const answer = parseMarketingRoiQuizAnswer(incomingMessage.text);

      if (!answer) {
        const invalidAnswerText = buildInvalidMarketingRoiQuizAnswerText(existingLead.current_stage);
        const invalidAnswerResult = await sendTextMessage(
          incomingMessage.telegramChatId,
          invalidAnswerText,
          getMarketingRoiQuizKeyboard(existingLead.current_stage),
        );

        await insertMessage({
          leadId: lead.id,
          expertProfileId: expertProfile.id,
          direction: "outgoing",
          channel: "telegram",
          telegramMessageId: invalidAnswerResult.telegramMessageId,
          text: invalidAnswerText,
          messageType: "qual_question",
        });

        return Response.json({ ok: true });
      }

      const nextStage = getNextMarketingRoiQuizStage(existingLead.current_stage);

      if (nextStage !== MARKETING_ROI_QUIZ_STAGES.completed) {
        await sendMarketingRoiQuizQuestion(incomingMessage.telegramChatId, lead.id, expertProfile.id, nextStage);
        await updateLeadById(lead.id, {
          currentStage: nextStage,
        });

        return Response.json({ ok: true });
      }

      const recentMessages = await getRecentMessagesByLeadId(lead.id, 10);
      const answerKeys = extractRecentMarketingRoiQuizAnswers(recentMessages);
      const verdictText = buildMarketingRoiQuizVerdict(answerKeys);
      const verdictResult = await sendTextMessage(incomingMessage.telegramChatId, verdictText);

      await insertMessage({
        leadId: lead.id,
        expertProfileId: expertProfile.id,
        direction: "outgoing",
        channel: "telegram",
        telegramMessageId: verdictResult.telegramMessageId,
        text: verdictText,
        messageType: "ai_reply",
      });

      await updateLeadById(lead.id, {
        status: "qualified",
        currentStage: MARKETING_ROI_QUIZ_STAGES.completed,
        matchedOffer: "diagnostic",
        warmthLevel: "warm",
      });
    } else {
      const [offers, faq, objections, messages] = await Promise.all([
        getActiveExpertOffers(expertProfile.id),
        getActiveExpertFaq(expertProfile.id),
        getActiveExpertObjections(expertProfile.id),
        getRecentMessagesByLeadId(lead.id, 4),
      ]);

      const prompt = buildNeiroPrompt({
        expert: expertProfile,
        offers,
        faq,
        objections,
        lead: updatedLead,
        messages,
      });
      const reply = await generateNeiroReply(prompt);
      const replyResult = await sendTextMessage(incomingMessage.telegramChatId, reply);

      await insertMessage({
        leadId: lead.id,
        expertProfileId: expertProfile.id,
        direction: "outgoing",
        channel: "telegram",
        telegramMessageId: replyResult.telegramMessageId,
        text: reply,
        messageType: "ai_reply",
      });

      if (reply.includes(getCalendarLink())) {
        await updateLeadById(lead.id, {
          currentStage: getBookedStage(updatedLead.matched_offer, updatedLead.current_stage),
        });
      }
    }

    return Response.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown webhook error.";
    console.error("Telegram webhook error:", message);
    return Response.json({ ok: false, error: message }, { status: 500 });
  }
}
