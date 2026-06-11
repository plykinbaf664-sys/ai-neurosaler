import type {
  SupabaseExpertFaqRow,
  SupabaseExpertObjectionRow,
  SupabaseExpertOfferRow,
  SupabaseExpertProfileRow,
  SupabaseLeadRow,
  SupabaseMessageRow,
} from "@/lib/supabase-rest";

type BuildNeiroPromptParams = {
  expert: SupabaseExpertProfileRow;
  offers: SupabaseExpertOfferRow[];
  faq: SupabaseExpertFaqRow[];
  objections: SupabaseExpertObjectionRow[];
  lead: SupabaseLeadRow;
  messages: SupabaseMessageRow[];
};

const MAX_SECTION_LENGTH = 320;
const MAX_MESSAGE_LENGTH = 220;
const MAX_ITEMS_PER_SECTION = 3;
function getCalendarLink() {
  return process.env.CALENDAR_LINK || "https://calendar.app.google/rpFMG61ce4dXL54z5";
}

function valueOrFallback(value: string | null | undefined, fallback = "Не указано") {
  return value?.trim() || fallback;
}

function truncateText(value: string | null | undefined, maxLength: number, fallback?: string) {
  const normalized = valueOrFallback(value, fallback);
  if (normalized.length <= maxLength) {
    return normalized;
  }
  return `${normalized.slice(0, maxLength).trim()}...`;
}

function formatOffers(offers: SupabaseExpertOfferRow[]) {
  if (offers.length === 0) {
    return "none";
  }

  return offers
    .slice(0, MAX_ITEMS_PER_SECTION)
    .map(
      (offer, index) =>
        `${index + 1}) ${truncateText(offer.title, 80)} | ${truncateText(offer.description, 120)} | price: ${truncateText(offer.price_text, 60)} | cta: ${truncateText(offer.cta_text, 80)}`,
    )
    .join("\n");
}

function formatFaq(faq: SupabaseExpertFaqRow[]) {
  if (faq.length === 0) {
    return "none";
  }

  return faq
    .slice(0, 2)
    .map(
      (item, index) =>
        `${index + 1}) Q: ${truncateText(item.question, 100)} | A: ${truncateText(item.answer, 140)}`,
    )
    .join("\n");
}

function formatObjections(objections: SupabaseExpertObjectionRow[]) {
  if (objections.length === 0) {
    return "none";
  }

  return objections
    .slice(0, 2)
    .map(
      (item, index) =>
        `${index + 1}) Obj: ${truncateText(item.objection, 100)} | Resp: ${truncateText(item.response, 140)}`,
    )
    .join("\n");
}

function formatMessages(messages: SupabaseMessageRow[]) {
  if (messages.length === 0) {
    return "none";
  }

  return [...messages]
    .sort((a, b) => a.created_at.localeCompare(b.created_at))
    .map((message) => {
      const author = message.direction === "incoming" ? "Клиент" : "Команда";
      return `${author}: ${truncateText(message.text, MAX_MESSAGE_LENGTH)}`;
    })
    .join("\n");
}

export function buildNeiroPrompt(params: BuildNeiroPromptParams) {
  const { expert, offers, faq, objections, lead, messages } = params;
  const calendarLink = getCalendarLink();

  return [
    "ROLE: AI-ассистент отдела продаж. Ты не эксперт.",
    "VOICE: говори от лица команды. Нельзя выдавать себя за эксперта или писать, будто у тебя есть личная практика.",
    "GOAL: быстро квалифицируй и веди к одному следующему шагу.",
    "NEXT STEP:",
    "- diagnostic = клиенту нужно разобраться и понять, что делать.",
    "- consulting = нужен совет, стратегия или разбор без внедрения под ключ.",
    "- done_for_you = клиент хочет готовое внедрение под ключ.",
    "- call_with_expert = нужен комплексный подход, личное включение эксперта, кастом, сопровождение или клиент сам хочет созвон.",
    "RULES:",
    "- выбирай только один следующий шаг.",
    "- не перечисляй все офферы сразу.",
    "- если данных хватает, не задавай лишние вопросы.",
    "- если клиент уже согласился на диагностику или созвон, не переспрашивай.",
    `- при согласии сразу дай ссылку на календарь: ${calendarLink}`,
    `- если ссылка на календарь уже была отправлена раньше или stage уже booked/confirmed, не отправляй ${calendarLink} повторно. Дальше отвечай только по текущему контексту диалога.`,
    "- если сообщение клиента похоже на 'да', 'ок', 'хорошо', 'давайте', 'готов', 'подходит' после предложения диагностики/созвона, это согласие.",
    "- если клиент спрашивает про видео, подарок, ссылку, пишет что не видит видео или просит продублировать доступ, сразу повторно отправь ссылку на видео.",
    "- не говори, что ты не видишь ссылку или не знаешь, о каком видео речь.",
    "- если нужен личный комплексный формат, веди на созвон с экспертом.",
    "STYLE:",
    "- коротко",
    "- по делу",
    "- без воды",
    "- без давления",
    "- без упоминания, что ты AI",
    "OUTPUT:",
    "1) коротко отзеркаль запрос",
    "2) один следующий шаг или один короткий вопрос",
    "3) если клиент согласился, сразу календарь",
    "4) если клиент спрашивает про подарок или видео, сразу дай gift link",
    "FORBIDDEN:",
    "- выдавать себя за эксперта",
    "- обещать то, чего нет в данных",
    "- давать несколько равнозначных офферов",
    "- после согласия снова спрашивать, подходит ли диагностика/созвон",
    "",
    `EXPERT: ${truncateText(expert.expert_name, 60)} | ${truncateText(expert.role_description, 120)} | ${truncateText(expert.core_positioning, MAX_SECTION_LENGTH)} | audience: ${truncateText(expert.target_audience, 140)}`,
    `COMMUNICATION: ${truncateText(expert.communication_rules, MAX_SECTION_LENGTH)}`,
    `DO_NOT_SAY: ${truncateText(expert.do_not_say_rules, MAX_SECTION_LENGTH)}`,
    `GIFT: ${truncateText(expert.gift_message, 120)} | video_link: ${expert.gift_url}`,
    `LEAD: status=${lead.status}; stage=${lead.current_stage}; warmth=${lead.warmth_level}; matched_offer=${valueOrFallback(lead.matched_offer, "unknown")}; last_message=${truncateText(lead.last_user_message, 160, "none")}`,
    "OFFERS:",
    formatOffers(offers),
    "FAQ:",
    formatFaq(faq),
    "OBJECTIONS:",
    formatObjections(objections),
    "DIALOGUE:",
    formatMessages(messages),
  ].join("\n");
}

export type { BuildNeiroPromptParams };
