export type PostQuizIntent =
  | "material_provided"
  | "no_materials"
  | "user_question"
  | "audit_agree"
  | "audit_decline"
  | "unclear";

type PostQuizIntentParams = {
  currentStage: string | null | undefined;
  text: string;
  hasDocument: boolean;
};

const URL_PATTERN = /https?:\/\/[^\s<>()"']+/i;

function normalizeText(text: string) {
  return text.trim().toLowerCase();
}

function hasAny(text: string, phrases: string[]) {
  return phrases.some((phrase) => text.includes(phrase));
}

function isQuestionText(text: string) {
  return text.includes("?") || hasAny(text, ["что такое", "что дальше", "как", "зачем", "сколько", "можно без", "а если"]);
}

function isSimpleAffirmative(text: string) {
  return hasAny(text, [
    "да",
    "давай",
    "давайте",
    "ок",
    "окей",
    "хочу",
    "готов",
    "готова",
    "согласен",
    "согласна",
    "передавай",
    "передай",
    "интересно",
  ]);
}

function isSimpleNegative(text: string) {
  return hasAny(text, [
    "нет",
    "не сейчас",
    "подумаю",
    "потом",
    "не надо",
    "не нужно",
    "не хочу",
    "не готов",
    "пока нет",
  ]);
}

function isMaterialText(text: string) {
  if (text.length >= 120) {
    return true;
  }

  return !isQuestionText(text) && hasAny(text, ["лендинг", "сайт", "pdf", "презентац", "описание продукта", "оффер", "файл", "материал"]);
}

function requestsMaterialAnalysis(text: string) {
  return hasAny(text, [
    "посмотри",
    "посмотрите",
    "глянь",
    "разбери",
    "разберите",
    "разбор",
    "проанализируй",
    "проанализируйте",
    "анализ",
    "что думаешь",
    "что скажешь",
    "оцени",
    "проверь",
  ]);
}

export function shouldClarifyBareUrl(text: string) {
  const normalized = normalizeText(text);
  return URL_PATTERN.test(normalized) && !requestsMaterialAnalysis(normalized) && !hasAny(normalized, ["аудит", "нейроаудит"]);
}

export function detectPostQuizIntent(params: PostQuizIntentParams): PostQuizIntent {
  const stage = params.currentStage ?? "";
  const text = normalizeText(params.text);
  const hasUrl = URL_PATTERN.test(text);

  if (
    params.hasDocument ||
    (hasUrl && (stage === "materials_requested" || requestsMaterialAnalysis(text))) ||
    (!hasUrl && isMaterialText(text))
  ) {
    return "material_provided";
  }

  if (stage === "materials_requested") {
    if (
      isSimpleNegative(text) ||
      hasAny(text, [
        "нет материалов",
        "скинуть нечего",
        "ничего нет",
        "сайта нет",
        "pdf нет",
        "пока только идея",
        "без материалов",
        "без pdf",
        "нечего скинуть",
        "мне нечего",
        "у меня нет",
      ])
    ) {
      return "no_materials";
    }

    if (isSimpleAffirmative(text)) {
      return "audit_agree";
    }
  }

  if (stage === "audit_offered") {
    if (isSimpleNegative(text)) {
      return "audit_decline";
    }

    if (isSimpleAffirmative(text)) {
      return "audit_agree";
    }
  }

  if (isQuestionText(text)) {
    return "user_question";
  }

  return "unclear";
}
