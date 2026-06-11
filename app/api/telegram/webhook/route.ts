import {
  createLead,
  createLeadMaterial,
  getActiveExpertFaq,
  getActiveExpertObjections,
  getActiveExpertOffers,
  getActiveExpertProfile,
  getLeadByTelegramUserId,
  getLeadMaterialsCount,
  getRecentMessagesByLeadId,
  insertMessage,
  updateLeadMaterialById,
  updateLeadById,
  type SupabaseExpertProfileRow,
  type SupabaseLeadRow,
} from "@/lib/supabase-rest";
import { buildNeiroPrompt } from "@/lib/neiroclozer/prompt-builder";
import { generateNeiroReply } from "@/lib/neiroclozer/generate-reply";
import {
  AFTER_HANDOFF_TEXT,
  AUDIT_AGREE_TEXT,
  AUDIT_DECLINE_TEXT,
  AUDIT_EXPLANATION_TEXT,
  MATERIAL_LIMIT_TEXT,
  MATERIALS_REQUEST_TEXT,
  MAX_MATERIALS_PER_LEAD,
  MAX_PDF_BYTES,
  NO_MATERIALS_TEXT,
  PDF_TEXT_EXTRACTION_FAILED_TEXT,
  PDF_TOO_LARGE_TEXT,
  POST_QUIZ_STAGES,
  POST_QUIZ_FOLLOWUP_LIMIT_TEXT,
  buildMaterialAnalysis,
  extractPdfTextFromArrayBuffer,
  extractTextMaterial,
  extractUrlMaterial,
  isPostQuizStage,
} from "@/lib/neiroclozer/materials-analysis";
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
import { detectPostQuizIntent } from "@/lib/neiroclozer/post-quiz-intent";
import {
  answerCallbackQuery,
  getTelegramFileDownloadUrl,
  parseTelegramPrivateTextMessage,
  sendTextMessage,
  verifyTelegramWebhookSecret,
} from "@/lib/telegram";

export const runtime = "nodejs";

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

async function sendAndStoreAiReply(chatId: number, leadId: string, expertProfileId: string, text: string) {
  const result = await sendTextMessage(chatId, text);

  await insertMessage({
    leadId,
    expertProfileId,
    direction: "outgoing",
    channel: "telegram",
    telegramMessageId: result.telegramMessageId,
    text,
    messageType: "ai_reply",
  });

  return result;
}

async function sendAndStorePlainText(chatId: number, leadId: string, expertProfileId: string, text: string) {
  const result = await sendTextMessage(chatId, text);

  await insertMessage({
    leadId,
    expertProfileId,
    direction: "outgoing",
    channel: "telegram",
    telegramMessageId: result.telegramMessageId,
    text,
    messageType: "ai_reply",
  });

  return result;
}

function countIncomingMessages(messages: { direction: string }[]) {
  return messages.filter((message) => message.direction === "incoming").length;
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

type IncomingTelegramMessage = NonNullable<ReturnType<typeof parseTelegramPrivateTextMessage>>;

async function saveFailedPdfMaterial(leadId: string, incomingMessage: IncomingTelegramMessage) {
  await createLeadMaterial({
    leadId,
    materialType: "pdf",
    telegramFileId: incomingMessage.document?.fileId ?? null,
    fileName: incomingMessage.document?.fileName ?? null,
    status: "failed",
  });
}

async function handlePostQuizMaterialsFlow(
  incomingMessage: IncomingTelegramMessage,
  lead: SupabaseLeadRow,
  expertProfile: SupabaseExpertProfileRow,
  intent: ReturnType<typeof detectPostQuizIntent>,
  recentIncomingCount: number,
) {
  const currentStage = lead.current_stage;

  if (currentStage === POST_QUIZ_STAGES.handoff) {
    await sendAndStorePlainText(incomingMessage.telegramChatId, lead.id, expertProfile.id, AFTER_HANDOFF_TEXT);
    return;
  }

  if (currentStage === POST_QUIZ_STAGES.materialsRequested) {
    if (intent === "material_provided") {
      const materialsCount = await getLeadMaterialsCount(lead.id);

      if (materialsCount >= MAX_MATERIALS_PER_LEAD) {
        await sendAndStorePlainText(incomingMessage.telegramChatId, lead.id, expertProfile.id, MATERIAL_LIMIT_TEXT);
        await updateLeadById(lead.id, {
          currentStage: POST_QUIZ_STAGES.auditOffered,
          matchedOffer: "diagnostic",
          warmthLevel: "warm",
        });
        return;
      }

      const hasDocument = Boolean(incomingMessage.document);
      let material =
        !hasDocument && ((await extractUrlMaterial(incomingMessage.text)) ?? extractTextMaterial(incomingMessage.text));

      if (hasDocument) {
        if (incomingMessage.document?.mimeType !== "application/pdf") {
          await sendAndStorePlainText(incomingMessage.telegramChatId, lead.id, expertProfile.id, NO_MATERIALS_TEXT);
          await updateLeadById(lead.id, {
            currentStage: POST_QUIZ_STAGES.auditOffered,
            matchedOffer: "diagnostic",
            warmthLevel: "warm",
          });
          return;
        }

        if (incomingMessage.document.fileSize && incomingMessage.document.fileSize > MAX_PDF_BYTES) {
          await saveFailedPdfMaterial(lead.id, incomingMessage);
          await sendAndStorePlainText(incomingMessage.telegramChatId, lead.id, expertProfile.id, PDF_TOO_LARGE_TEXT);
          return;
        }

        const downloadUrl = await getTelegramFileDownloadUrl(incomingMessage.document.fileId);
        const response = await fetch(downloadUrl);

        if (!response.ok) {
          throw new Error(`Telegram file download failed with status ${response.status}.`);
        }

        const arrayBuffer = await response.arrayBuffer();

        if (arrayBuffer.byteLength > MAX_PDF_BYTES) {
          await saveFailedPdfMaterial(lead.id, incomingMessage);
          await sendAndStorePlainText(incomingMessage.telegramChatId, lead.id, expertProfile.id, PDF_TOO_LARGE_TEXT);
          return;
        }

        const rawText = await extractPdfTextFromArrayBuffer(arrayBuffer);

        if (!rawText) {
          await saveFailedPdfMaterial(lead.id, incomingMessage);
          await sendAndStorePlainText(
            incomingMessage.telegramChatId,
            lead.id,
            expertProfile.id,
            PDF_TEXT_EXTRACTION_FAILED_TEXT,
          );
          return;
        }

        material = {
          materialType: "pdf" as const,
          sourceUrl: null,
          rawText,
          telegramFileId: incomingMessage.document.fileId,
          fileName: incomingMessage.document.fileName,
        };
      }

      if (!material) {
        await sendAndStorePlainText(incomingMessage.telegramChatId, lead.id, expertProfile.id, NO_MATERIALS_TEXT);
        await updateLeadById(lead.id, {
          currentStage: POST_QUIZ_STAGES.auditOffered,
          matchedOffer: "diagnostic",
          warmthLevel: "warm",
        });
        return;
      }

      const savedMaterial = await createLeadMaterial({
        leadId: lead.id,
        materialType: material.materialType,
        sourceUrl: material.sourceUrl ?? null,
        telegramFileId: material.telegramFileId ?? null,
        fileName: material.fileName ?? null,
        rawText: material.rawText,
        status: "received",
      });

      await updateLeadById(lead.id, {
        currentStage: POST_QUIZ_STAGES.materialsReceived,
        matchedOffer: "diagnostic",
        warmthLevel: "warm",
      });

      const analysis = await buildMaterialAnalysis({
        lead,
        materialText: material.rawText,
        materialType: material.materialType,
      });

      await updateLeadMaterialById(savedMaterial.id, {
        analysis,
        status: "analyzed",
      });

      await sendAndStoreAiReply(incomingMessage.telegramChatId, lead.id, expertProfile.id, analysis);
      await updateLeadById(lead.id, {
        status: "qualified",
        currentStage: POST_QUIZ_STAGES.auditOffered,
        matchedOffer: "diagnostic",
        warmthLevel: "warm",
      });
      return;
    }

    if (intent === "no_materials") {
      await sendAndStorePlainText(incomingMessage.telegramChatId, lead.id, expertProfile.id, NO_MATERIALS_TEXT);
      await updateLeadById(lead.id, {
        currentStage: POST_QUIZ_STAGES.auditOffered,
        matchedOffer: "diagnostic",
        warmthLevel: "warm",
      });
      return;
    }

    if (intent === "user_question") {
      const replyText = recentIncomingCount >= 12 ? POST_QUIZ_FOLLOWUP_LIMIT_TEXT : AUDIT_EXPLANATION_TEXT;
      await sendAndStorePlainText(incomingMessage.telegramChatId, lead.id, expertProfile.id, replyText);
      await updateLeadById(lead.id, {
        currentStage: POST_QUIZ_STAGES.auditOffered,
        matchedOffer: "diagnostic",
        warmthLevel: "warm",
      });
      return;
    }

    if (intent === "audit_agree") {
      await sendAndStorePlainText(incomingMessage.telegramChatId, lead.id, expertProfile.id, AUDIT_EXPLANATION_TEXT);
      await updateLeadById(lead.id, {
        currentStage: POST_QUIZ_STAGES.auditOffered,
        matchedOffer: "diagnostic",
        warmthLevel: "warm",
      });
      return;
    }

    await sendAndStorePlainText(incomingMessage.telegramChatId, lead.id, expertProfile.id, AUDIT_EXPLANATION_TEXT);
    await updateLeadById(lead.id, {
      currentStage: POST_QUIZ_STAGES.auditOffered,
      matchedOffer: "diagnostic",
      warmthLevel: "warm",
    });
    return;
  }

  if (currentStage === POST_QUIZ_STAGES.auditOffered) {
    if (intent === "audit_agree") {
      await sendAndStorePlainText(incomingMessage.telegramChatId, lead.id, expertProfile.id, AUDIT_AGREE_TEXT);
      await updateLeadById(lead.id, {
        status: "needs_manual_followup",
        currentStage: POST_QUIZ_STAGES.handoff,
        matchedOffer: "diagnostic",
        warmthLevel: "hot",
      });
      return;
    }

    if (intent === "audit_decline") {
      await sendAndStorePlainText(incomingMessage.telegramChatId, lead.id, expertProfile.id, AUDIT_DECLINE_TEXT);
      return;
    }

    if (intent === "material_provided") {
      if (recentIncomingCount >= 12) {
        await sendAndStorePlainText(
          incomingMessage.telegramChatId,
          lead.id,
          expertProfile.id,
          POST_QUIZ_FOLLOWUP_LIMIT_TEXT,
        );
        return;
      }

      const materialsCount = await getLeadMaterialsCount(lead.id);

      if (materialsCount >= MAX_MATERIALS_PER_LEAD) {
        await sendAndStorePlainText(incomingMessage.telegramChatId, lead.id, expertProfile.id, MATERIAL_LIMIT_TEXT);
        return;
      }

      const hasDocument = Boolean(incomingMessage.document);
      let material =
        !hasDocument && ((await extractUrlMaterial(incomingMessage.text)) ?? extractTextMaterial(incomingMessage.text));

      if (hasDocument) {
        if (incomingMessage.document?.mimeType !== "application/pdf") {
          await sendAndStorePlainText(incomingMessage.telegramChatId, lead.id, expertProfile.id, AUDIT_EXPLANATION_TEXT);
          return;
        }

        if (incomingMessage.document.fileSize && incomingMessage.document.fileSize > MAX_PDF_BYTES) {
          await saveFailedPdfMaterial(lead.id, incomingMessage);
          await sendAndStorePlainText(incomingMessage.telegramChatId, lead.id, expertProfile.id, PDF_TOO_LARGE_TEXT);
          return;
        }

        const downloadUrl = await getTelegramFileDownloadUrl(incomingMessage.document.fileId);
        const response = await fetch(downloadUrl);

        if (!response.ok) {
          throw new Error(`Telegram file download failed with status ${response.status}.`);
        }

        const arrayBuffer = await response.arrayBuffer();

        if (arrayBuffer.byteLength > MAX_PDF_BYTES) {
          await saveFailedPdfMaterial(lead.id, incomingMessage);
          await sendAndStorePlainText(incomingMessage.telegramChatId, lead.id, expertProfile.id, PDF_TOO_LARGE_TEXT);
          return;
        }

        const rawText = await extractPdfTextFromArrayBuffer(arrayBuffer);

        if (!rawText) {
          await saveFailedPdfMaterial(lead.id, incomingMessage);
          await sendAndStorePlainText(
            incomingMessage.telegramChatId,
            lead.id,
            expertProfile.id,
            PDF_TEXT_EXTRACTION_FAILED_TEXT,
          );
          return;
        }

        material = {
          materialType: "pdf" as const,
          sourceUrl: null,
          rawText,
          telegramFileId: incomingMessage.document.fileId,
          fileName: incomingMessage.document.fileName,
        };
      }

      if (!material) {
        await sendAndStorePlainText(incomingMessage.telegramChatId, lead.id, expertProfile.id, AUDIT_EXPLANATION_TEXT);
        return;
      }

      const savedMaterial = await createLeadMaterial({
        leadId: lead.id,
        materialType: material.materialType,
        sourceUrl: material.sourceUrl ?? null,
        telegramFileId: material.telegramFileId ?? null,
        fileName: material.fileName ?? null,
        rawText: material.rawText,
        status: "received",
      });

      await updateLeadById(lead.id, {
        currentStage: POST_QUIZ_STAGES.materialsReceived,
        matchedOffer: "diagnostic",
        warmthLevel: "warm",
      });

      const analysis = await buildMaterialAnalysis({
        lead,
        materialText: material.rawText,
        materialType: material.materialType,
      });

      await updateLeadMaterialById(savedMaterial.id, {
        analysis,
        status: "analyzed",
      });

      await sendAndStoreAiReply(incomingMessage.telegramChatId, lead.id, expertProfile.id, analysis);
      await updateLeadById(lead.id, {
        status: "qualified",
        currentStage: POST_QUIZ_STAGES.auditOffered,
        matchedOffer: "diagnostic",
        warmthLevel: "warm",
      });
      return;
    }

    if (recentIncomingCount >= 12) {
      await sendAndStorePlainText(incomingMessage.telegramChatId, lead.id, expertProfile.id, POST_QUIZ_FOLLOWUP_LIMIT_TEXT);
      return;
    }

    await sendAndStorePlainText(incomingMessage.telegramChatId, lead.id, expertProfile.id, AUDIT_EXPLANATION_TEXT);
  }
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
    const isExistingPostQuizStage = !shouldRestartQuiz && isPostQuizStage(existingLead?.current_stage);
    const normalizedUserText = incomingMessage.text.toLowerCase();
    const hasBooked = hasBookedSignal(normalizedUserText);
    const hasPositiveReply = isShortPositiveReply(normalizedUserText);
    const matchedOffer = shouldRestartQuiz
      ? null
      : isExistingQuizStage || isExistingPostQuizStage
      ? existingLead?.matched_offer ?? null
      : detectFinalMatchedOffer(detectMatchedOffer(normalizedUserText), existingLead?.matched_offer, hasBooked);
    const manualFollowup = needsManualFollowup(normalizedUserText);
    const warmthLevel = detectWarmthLevel(normalizedUserText, matchedOffer, manualFollowup);
    const leadStatus = shouldRestartQuiz
      ? "active"
      : isExistingQuizStage || isExistingPostQuizStage
      ? existingLead?.status ?? "active"
      : hasBooked || (hasPositiveReply && (matchedOffer === "diagnostic" || manualFollowup))
        ? "qualified"
        : detectLeadStatus(isNewLead, matchedOffer, warmthLevel, manualFollowup);
    const currentStage =
      (isNewLead && entryFlowMode === "quiz") || shouldRestartQuiz
        ? MARKETING_ROI_QUIZ_STAGES.question1
        : isExistingQuizStage || isExistingPostQuizStage
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

      const materialsRequestResult = await sendTextMessage(incomingMessage.telegramChatId, MATERIALS_REQUEST_TEXT);

      await insertMessage({
        leadId: lead.id,
        expertProfileId: expertProfile.id,
        direction: "outgoing",
        channel: "telegram",
        telegramMessageId: materialsRequestResult.telegramMessageId,
        text: MATERIALS_REQUEST_TEXT,
        messageType: "qual_question",
      });

      await updateLeadById(lead.id, {
        status: "qualified",
        currentStage: POST_QUIZ_STAGES.materialsRequested,
        matchedOffer: "diagnostic",
        warmthLevel: "warm",
      });
    } else if (isExistingPostQuizStage) {
      const recentMessages = await getRecentMessagesByLeadId(lead.id, 30);
      const intent = detectPostQuizIntent({
        currentStage: updatedLead.current_stage,
        text: incomingMessage.text,
        hasDocument: Boolean(incomingMessage.document),
      });
      const recentIncomingCount = countIncomingMessages(recentMessages);

      await handlePostQuizMaterialsFlow(incomingMessage, updatedLead, expertProfile, intent, recentIncomingCount);
    } else {
      const [offers, faq, objections, messages] = await Promise.all([
        getActiveExpertOffers(expertProfile.id),
        getActiveExpertFaq(expertProfile.id),
        getActiveExpertObjections(expertProfile.id),
        getRecentMessagesByLeadId(lead.id, 10),
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
