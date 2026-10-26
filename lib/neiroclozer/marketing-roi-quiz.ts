export type MarketingRoiQuizAnswerKey = "A" | "B" | "C" | "D";

type MarketingRoiQuizOption = {
  key: MarketingRoiQuizAnswerKey;
  label: string;
  score: number;
};

type MarketingRoiQuizQuestion = {
  stage: string;
  text: string;
  options: MarketingRoiQuizOption[];
};

const ANSWER_SCORES: Record<MarketingRoiQuizAnswerKey, number> = {
  A: 0,
  B: 1,
  C: 2,
  D: 3,
};

export const MARKETING_ROI_QUIZ_STAGES = {
  question1: "marketing_roi_quiz_q1",
  question2: "marketing_roi_quiz_q2",
  question3: "marketing_roi_quiz_q3",
  completed: "marketing_roi_quiz_completed",
} as const;

export const MARKETING_ROI_QUIZ_QUESTIONS: MarketingRoiQuizQuestion[] = [
  {
    stage: MARKETING_ROI_QUIZ_STAGES.question1,
    text: "Сначала пойму, как у тебя устроен маркетинг.\n\n1/3. Сколько заявок за месяц приходит из рекламы и контента?",
    options: [
      { key: "A", label: "До 10 заявок", score: ANSWER_SCORES.A },
      { key: "B", label: "11–30 заявок", score: ANSWER_SCORES.B },
      { key: "C", label: "31–100 заявок", score: ANSWER_SCORES.C },
      { key: "D", label: "100+ заявок", score: ANSWER_SCORES.D },
    ],
  },
  {
    stage: MARKETING_ROI_QUIZ_STAGES.question2,
    text: "2/3. Как ты понимаешь, сколько денег приносит маркетинг?",
    options: [
      { key: "A", label: "Пока не можем связать заявки с деньгами", score: ANSWER_SCORES.A },
      { key: "B", label: "Ориентируемся примерно, без расчётов", score: ANSWER_SCORES.B },
      { key: "C", label: "Считаем вручную, но есть пробелы", score: ANSWER_SCORES.C },
      { key: "D", label: "Видим точные цифры по выручке", score: ANSWER_SCORES.D },
    ],
  },
  {
    stage: MARKETING_ROI_QUIZ_STAGES.question3,
    text: "3/3. Что обычно происходит после того, как человек оставляет заявку?",
    options: [
      { key: "A", label: "Отвечаем поздно, часть заявок теряется", score: ANSWER_SCORES.A },
      { key: "B", label: "К части клиентов возвращаемся, про других забываем", score: ANSWER_SCORES.B },
      { key: "C", label: "Обычно всё в порядке, иногда упускаем шаги", score: ANSWER_SCORES.C },
      { key: "D", label: "Почти у каждой заявки есть следующий шаг", score: ANSWER_SCORES.D },
    ],
  },
];

function getQuestionByStage(stage: string | null | undefined) {
  return MARKETING_ROI_QUIZ_QUESTIONS.find((question) => question.stage === stage) ?? null;
}

export function isMarketingRoiQuizStage(stage: string | null | undefined) {
  return Boolean(getQuestionByStage(stage));
}

export function getMarketingRoiQuizQuestion(stage: string) {
  return getQuestionByStage(stage);
}

export function getMarketingRoiQuizKeyboard(stage: string) {
  const question = getQuestionByStage(stage);

  if (!question) {
    return undefined;
  }

  return {
    inline_keyboard: question.options.map((option) => [
      {
        text: option.label,
        callback_data: option.key,
      },
    ]),
  };
}

export function parseMarketingRoiQuizAnswer(text: string): MarketingRoiQuizAnswerKey | null {
  const firstLetter = text.trim().slice(0, 1).toUpperCase();

  if (firstLetter === "A" || firstLetter === "B" || firstLetter === "C" || firstLetter === "D") {
    return firstLetter;
  }

  return null;
}

export function getNextMarketingRoiQuizStage(stage: string) {
  if (stage === MARKETING_ROI_QUIZ_STAGES.question1) {
    return MARKETING_ROI_QUIZ_STAGES.question2;
  }

  if (stage === MARKETING_ROI_QUIZ_STAGES.question2) {
    return MARKETING_ROI_QUIZ_STAGES.question3;
  }

  return MARKETING_ROI_QUIZ_STAGES.completed;
}

export function buildInvalidMarketingRoiQuizAnswerText(stage: string) {
  const question = getQuestionByStage(stage);

  if (!question) {
    return "Выберите один из вариантов ответа.";
  }

  return `Выберите один из вариантов ответа кнопкой ниже.\n\n${question.text}`;
}

export function buildMarketingRoiQuizVerdict(answerKeys: MarketingRoiQuizAnswerKey[]) {
  const score = answerKeys.reduce((sum, answerKey) => sum + ANSWER_SCORES[answerKey], 0);

  if (score <= 2) {
    return [
      "Критическая просадка окупаемости",
      "",
      "Похоже, маркетинг у вас сейчас работает вслепую или теряет деньги уже на этапе обработки лидов. Обычно в такой ситуации проблема не только в трафике, а в разрыве между заявкой, скоростью ответа и пониманием цифр.",
      "",
      "Если хочешь, я могу помочь быстро понять, где именно у тебя теряются деньги в маркетинге, и передать тебя на разбор.",
    ].join("\n");
  }

  if (score <= 5) {
    return [
      "Частичная окупаемость, но много потерь",
      "",
      "У вас уже есть база, но часть денег теряется в процессе. Обычно это история про неполный контроль цифр, просадки в обработке и слабую систему дожима.",
      "",
      "Если хочешь, я могу помочь быстро понять, где именно у тебя теряются деньги в маркетинге, и передать тебя на разбор.",
    ].join("\n");
  }

  return [
    "Маркетинг работает, но можно усилить",
    "",
    "Похоже, у вас уже есть рабочая основа. Но даже в такой ситуации можно заметно усилить окупаемость за счёт более точного контроля, быстрой реакции на лидов и докрутки воронки.",
    "",
    "Если хочешь, я могу помочь быстро понять, где именно у тебя теряются деньги в маркетинге, и передать тебя на разбор.",
  ].join("\n");
}
