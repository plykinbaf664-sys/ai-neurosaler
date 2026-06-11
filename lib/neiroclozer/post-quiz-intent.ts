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
      hasAny(text, [
        "нет материалов",
        "пока нет",
        "нечего",
        "скинуть нечего",
        "ничего нет",
        "сайта нет",
        "pdf нет",
        "пока только идея",
        "пока ничего",
        "у меня нет",
        "мне нечего",
        "без материалов",
        "без pdf",
      ])
    ) {
      return "no_materials";
    }
  }

  if (stage === "audit_offered") {
    if (
      hasAny(text, [
        "не сейчас",
        "подумаю",
        "потом",
        "не надо",
        "не нужно",
        "не хочу",
        "не готов",
        "пока нет",
      ])
    ) {
      return "audit_decline";
    }

    if (
      hasAny(text, [
        "да",
        "давай",
        "передавай",
        "ок",
        "окей",
        "хочу",
        "интересно",
        "согласен",
        "согласна",
        "готов",
      ])
    ) {
      return "audit_agree";
    }
  }

  if (isQuestionText(text)) {
    return "user_question";
  }

  return "unclear";
}
