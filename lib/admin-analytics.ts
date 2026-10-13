import type { LeadRow, UserEventName } from "@/lib/storage/types";

export type AnalyticsLead = Pick<LeadRow, "id" | "created_at" | "status" | "current_stage" | "gift_link_clicked_at">;

export type AnalyticsPeriod = 0 | 7 | 30;

export type AnalyticsEvent = {
  user_id: string;
  event_name: UserEventName;
  created_at: string;
  category: string | null;
  metadata: Record<string, unknown>;
};

export type AdminAnalytics = {
  period: AnalyticsPeriod;
  people: number;
  menu: number;
  marketing: number;
  quizAnswers: [number, number, number];
  quizCompleted: number;
  category: number;
  life: number;
  business: number;
  materialSelected: number;
  materialLinkClicked: number;
  materialCompleted: number;
  giftClicked: number;
  qualified: number;
  handoff: number;
  clicks: Record<"category" | "material" | "link" | "next" | "gift", number>;
  categoryClicks: { life: number; business: number };
  topMaterials: { title: string; clicks: number }[];
};

const QUESTION_STAGES = ["marketing_roi_quiz_q1", "marketing_roi_quiz_q2", "marketing_roi_quiz_q3"];

export const ADMIN_ANALYTICS_EVENT_NAMES: UserEventName[] = [
  "library_opened", "marketing_selected", "marketing_quiz_answered", "marketing_quiz_completed",
  "category_selected", "material_presented", "material_link_clicked", "material_completed",
  "gift_link_clicked", "next_material_clicked",
];

const FUNNEL_KEYS = [
  "menu", "marketing", "quiz1", "quiz2", "quiz3", "quizCompleted", "category", "life", "business",
  "materialSelected", "materialLinkClicked", "materialCompleted", "giftClicked",
] as const;
type FunnelKey = typeof FUNNEL_KEYS[number];

// Retain one bit mask per cohort user, not the event history or multiple user sets.
export function createAdminAnalyticsAccumulator(period: AnalyticsPeriod, now = Date.now()) {
  const cutoff = period ? now - period * 86_400_000 : 0;
  const cohort = new Map<string, number>();
  const counts = Object.fromEntries(FUNNEL_KEYS.map((key) => [key, 0])) as Record<FunnelKey, number>;
  const clicks = { category: 0, material: 0, link: 0, next: 0, gift: 0 };
  const categoryClicks = { life: 0, business: 0 };
  const materialClicks = new Map<string, number>();
  let qualified = 0;
  let handoff = 0;

  function mark(userId: string, key: FunnelKey) {
    const previous = cohort.get(userId);
    if (previous === undefined) return;
    const bit = 1 << FUNNEL_KEYS.indexOf(key);
    if (!(previous & bit)) {
      cohort.set(userId, previous | bit);
      counts[key]++;
    }
  }

  return {
    addLead(lead: AnalyticsLead) {
      if (!(Date.parse(lead.created_at) >= cutoff) || cohort.has(lead.id)) return;
      cohort.set(lead.id, 0);
      if (lead.gift_link_clicked_at) mark(lead.id, "giftClicked");
      if (["qualified", "needs_manual_followup"].includes(lead.status)) qualified++;
      if (lead.status === "needs_manual_followup" || /(booked|confirmed|handoff)/.test(lead.current_stage)) handoff++;
    },
    addEvent(event: AnalyticsEvent) {
      const active = Date.parse(event.created_at) >= cutoff;
      switch (event.event_name) {
        case "library_opened":
          if (event.category === null) mark(event.user_id, "menu");
          break;
        case "marketing_selected": mark(event.user_id, "marketing"); break;
        case "marketing_quiz_answered": {
          const index = QUESTION_STAGES.indexOf(event.metadata.question as string);
          if (index >= 0) mark(event.user_id, (["quiz1", "quiz2", "quiz3"] as const)[index]);
          break;
        }
        case "marketing_quiz_completed": mark(event.user_id, "quizCompleted"); break;
        case "category_selected":
          mark(event.user_id, "category");
          if (active) clicks.category++;
          if (event.category === "life" || event.category === "business") {
            mark(event.user_id, event.category);
            if (active) categoryClicks[event.category]++;
          }
          break;
        case "material_presented":
          mark(event.user_id, "materialSelected");
          if (active) {
            clicks.material++;
            const title = typeof event.metadata.title === "string" ? event.metadata.title : "Материал";
            materialClicks.set(title, (materialClicks.get(title) ?? 0) + 1);
          }
          break;
        case "material_link_clicked":
          mark(event.user_id, "materialLinkClicked");
          if (active) clicks.link++;
          break;
        case "material_completed": mark(event.user_id, "materialCompleted"); break;
        case "gift_link_clicked":
          mark(event.user_id, "giftClicked");
          if (active) clicks.gift++;
          break;
        case "next_material_clicked": if (active) clicks.next++; break;
      }
    },
    result(): AdminAnalytics {
      return {
        period, people: cohort.size,
        menu: counts.menu, marketing: counts.marketing,
        quizAnswers: [counts.quiz1, counts.quiz2, counts.quiz3],
        quizCompleted: counts.quizCompleted, category: counts.category,
        life: counts.life, business: counts.business,
        materialSelected: counts.materialSelected, materialLinkClicked: counts.materialLinkClicked,
        materialCompleted: counts.materialCompleted, giftClicked: counts.giftClicked,
        qualified, handoff, clicks: { ...clicks }, categoryClicks: { ...categoryClicks },
        topMaterials: [...materialClicks].map(([title, count]) => ({ title, clicks: count }))
          .sort((a, b) => b.clicks - a.clicks).slice(0, 3),
      };
    },
  };
}

export function buildAdminAnalytics(
  leads: AnalyticsLead[],
  events: AnalyticsEvent[],
  period: AnalyticsPeriod,
  now = Date.now(),
): AdminAnalytics {
  const accumulator = createAdminAnalyticsAccumulator(period, now);
  for (const lead of leads) accumulator.addLead(lead);
  for (const event of events) accumulator.addEvent(event);
  return accumulator.result();
}
