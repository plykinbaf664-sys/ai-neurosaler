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

  if (text.match(/https?:\/\/[^\s<>()"']+/i)) {
    return true;
  }

  return !isQuestionText(text) && hasAny(text, ["лендинг", "сайт", "pdf", "презентац", "описание продукта", "оффер", "файл", "материал"]);
}

export function detectPostQuizIntent(params: PostQuizIntentParams): PostQuizIntent {
  const stage = params.currentStage ?? "";
  const text = normalizeText(params.text);

  if (params.hasDocument || isMaterialText(text)) {
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
