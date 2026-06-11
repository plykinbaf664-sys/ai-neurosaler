import type { SupabaseLeadRow } from "@/lib/supabase-rest";
import { generateAnthropicText } from "@/lib/neiroclozer/generate-reply";

export const POST_QUIZ_STAGES = {
  quizCompleted: "quiz_completed",
  materialsRequested: "materials_requested",
  materialsReceived: "materials_received",
  materialsAnalyzed: "materials_analyzed",
  auditOffered: "audit_offered",
  handoff: "handoff",
} as const;

export const MATERIALS_REQUEST_TEXT = [
  "Если у тебя уже есть материалы, которые хочешь, чтобы я посмотрел, скинь сюда сайт, PDF, презентацию, описание продукта или текст оффера.",
  "",
  "Я коротко гляну и скажу, где, скорее всего, теряются заявки. Без занудного аудита на 40 страниц, обещаю.",
].join("\n");

export const PDF_TEXT_EXTRACTION_FAILED_TEXT =
  "Не смог нормально прочитать текст в файле. Похоже, это скан или PDF без текстового слоя. Можешь скинуть ссылку на сайт, текстом или PDF, где текст можно выделить.";

export const PDF_TOO_LARGE_TEXT =
  "PDF тяжеловат для быстрого разбора в чате. Скинь, пожалуйста, ссылку на страницу или вставь сюда ключевой текст оффера, так я быстрее посмотрю суть.";

export const MATERIAL_LIMIT_TEXT =
  "Я уже посмотрел два материала. Чтобы не превращать чат в бесконечный бесплатный аудит, дальше лучше передать всё Александру на нейроаудит. Хочешь, передам ему твои ответы и материалы?";

export const AFTER_HANDOFF_TEXT =
  "Я уже передал контекст Александру. Дальше лучше не распыляться в чате: он посмотрит материалы и подскажет, где именно теряются заявки.";

export const DEEP_FOLLOWUP_TEXT =
  "Могу коротко подсветить общую логику, но полноценный разбор тут лучше не растягивать в переписке. По материалам уже видно, что есть что смотреть глубже. Я могу передать это Александру, и он скажет, где именно теряются заявки и что можно автоматизировать первым.";

export const MAX_MATERIALS_PER_LEAD = 2;
export const MAX_PDF_BYTES = 8 * 1024 * 1024;
const MAX_MATERIAL_TEXT_CHARS = 12000;
const MIN_EXTRACTED_TEXT_CHARS = 80;

export type LeadMaterialType = "pdf" | "url" | "text" | "unknown";

export type ExtractedMaterial = {
  materialType: LeadMaterialType;
  sourceUrl: string | null;
  telegramFileId?: string | null;
  fileName?: string | null;
  rawText: string;
};

export function isPostQuizStage(stage: string | null | undefined) {
  return (
    stage === POST_QUIZ_STAGES.quizCompleted ||
    stage === POST_QUIZ_STAGES.materialsRequested ||
    stage === POST_QUIZ_STAGES.materialsReceived ||
    stage === POST_QUIZ_STAGES.materialsAnalyzed ||
    stage === POST_QUIZ_STAGES.auditOffered ||
    stage === POST_QUIZ_STAGES.handoff
  );
}

export function detectHandoffConsent(text: string) {
  const normalized = text.trim().toLowerCase();

  return [
    "да",
    "давай",
    "ок",
    "окей",
    "хорошо",
    "передай",
    "передавайте",
    "согласен",
    "согласна",
    "хочу",
    "да, передай",
  ].some((phrase) => normalized === phrase || normalized.includes(phrase));
}

export function extractFirstUrl(text: string) {
  return text.match(/https?:\/\/[^\s<>()"']+/i)?.[0] ?? null;
}

export function isLikelyMaterialText(text: string) {
  return text.trim().length >= 80;
}

export function truncateMaterialText(text: string) {
  return normalizeWhitespace(text).slice(0, MAX_MATERIAL_TEXT_CHARS);
}

export async function extractUrlMaterial(text: string): Promise<ExtractedMaterial | null> {
  const sourceUrl = extractFirstUrl(text);

  if (!sourceUrl) {
    return null;
  }

  const response = await fetch(sourceUrl, {
    headers: {
      "User-Agent": "ai-neurosaler-materials-bot/1.0",
    },
  });

  if (!response.ok) {
    throw new Error(`Material URL fetch failed: ${response.status}`);
  }

  const html = await response.text();
  const rawText = truncateMaterialText(extractReadableTextFromHtml(html));

  if (rawText.length < MIN_EXTRACTED_TEXT_CHARS) {
    return null;
  }

  return {
    materialType: "url",
    sourceUrl,
    rawText,
  };
}

export function extractTextMaterial(text: string): ExtractedMaterial | null {
  if (!isLikelyMaterialText(text)) {
    return null;
  }

  return {
    materialType: "text",
    sourceUrl: null,
    rawText: truncateMaterialText(text),
  };
}

export async function extractPdfTextFromArrayBuffer(arrayBuffer: ArrayBuffer) {
  const { PDFParse } = await import("pdf-parse");
  const parser = new PDFParse({ data: new Uint8Array(arrayBuffer) });

  try {
    const result = await parser.getText();
    const text = truncateMaterialText(result.text ?? "");

    if (text.length < MIN_EXTRACTED_TEXT_CHARS) {
      return null;
    }

    return text;
  } finally {
    await parser.destroy();
  }
}

export async function buildMaterialAnalysis(params: {
  lead: SupabaseLeadRow;
  materialText: string;
  materialType: LeadMaterialType;
}) {
  const prompt = [
    "ROLE: Ты живой ассистент Александра. Ты не Александр и не притворяешься им.",
    "TASK: Дай короткий предварительный разбор материала после квиза. Это НЕ полный аудит.",
    "VOICE: по-человечески, спокойно, эмпатично, без канцелярита. Можно лёгкую иронию, если уместно.",
    "BOUNDARIES:",
    "- не делай полный аудит;",
    "- не выдавай стратегию на 3 месяца;",
    "- не обещай точный результат;",
    "- не упоминай prompt, webhook, Supabase, Anthropic, state machine, route, API, код, базу данных;",
    "- не уходи в бесконечную консультацию;",
    "- после краткого вывода предложи нейроаудит Александра;",
    "- спроси, передать ли Александру ответы и материалы.",
    "FORMAT:",
    "1) коротко признай ситуацию пользователя;",
    "2) скажи, что стало понятнее по материалам;",
    "3) дай 2-3 вероятные просадки;",
    "4) объясни, почему это может тормозить заявки или продажи;",
    "5) мягко предложи нейроаудит Александра;",
    "6) закончи вопросом о передаче материалов Александру.",
    "LIMIT: до 1700 символов.",
    "",
    `LEAD_STAGE: ${params.lead.current_stage}`,
    `LEAD_STATUS: ${params.lead.status}`,
    `MATERIAL_TYPE: ${params.materialType}`,
    "MATERIAL_TEXT:",
    params.materialText,
  ].join("\n");

  return generateAnthropicText(prompt, 520);
}

function extractReadableTextFromHtml(html: string) {
  return normalizeWhitespace(
    html
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<svg[\s\S]*?<\/svg>/gi, " ")
      .replace(/<head[\s\S]*?<\/head>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'"),
  );
}

function normalizeWhitespace(value: string) {
  return value.replace(/\s+/g, " ").trim();
}
