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

export function buildAdminAnalytics(
  leads: AnalyticsLead[],
  events: AnalyticsEvent[],
  period: AnalyticsPeriod,
  now = Date.now(),
): AdminAnalytics {
  const cutoff = period ? now - period * 86_400_000 : 0;
  const cohort = leads.filter((lead) => Date.parse(lead.created_at) >= cutoff);
  const cohortIds = new Set(cohort.map((lead) => lead.id));
  const cohortEvents = events.filter((event) => cohortIds.has(event.user_id));
  const unique = (predicate: (event: AnalyticsEvent) => boolean) =>
    new Set(cohortEvents.filter(predicate).map((event) => event.user_id)).size;
  const activity = events.filter((event) => Date.parse(event.created_at) >= cutoff);
  const clicks = (name: UserEventName) => activity.filter((event) => event.event_name === name).length;
  const materialClicks = new Map<string, number>();
  for (const event of activity) {
    if (event.event_name !== "material_presented") continue;
    const title = typeof event.metadata.title === "string" ? event.metadata.title : "Материал";
    materialClicks.set(title, (materialClicks.get(title) ?? 0) + 1);
  }

  return {
    period,
    people: cohort.length,
    menu: unique((event) => event.event_name === "library_opened" && event.category === null),
    marketing: unique((event) => event.event_name === "marketing_selected"),
    quizAnswers: QUESTION_STAGES.map((stage) =>
      unique((event) => event.event_name === "marketing_quiz_answered" && event.metadata.question === stage),
    ) as [number, number, number],
    quizCompleted: unique((event) => event.event_name === "marketing_quiz_completed"),
    category: unique((event) => event.event_name === "category_selected"),
    life: unique((event) => event.event_name === "category_selected" && event.category === "life"),
    business: unique((event) => event.event_name === "category_selected" && event.category === "business"),
    materialSelected: unique((event) => event.event_name === "material_presented"),
    materialLinkClicked: unique((event) => event.event_name === "material_link_clicked"),
    materialCompleted: unique((event) => event.event_name === "material_completed"),
    giftClicked: new Set([
      ...cohort.filter((lead) => lead.gift_link_clicked_at).map((lead) => lead.id),
      ...cohortEvents.filter((event) => event.event_name === "gift_link_clicked").map((event) => event.user_id),
    ]).size,
    qualified: cohort.filter((lead) => ["qualified", "needs_manual_followup"].includes(lead.status)).length,
    handoff: cohort.filter((lead) =>
      lead.status === "needs_manual_followup" || /(booked|confirmed|handoff)/.test(lead.current_stage),
    ).length,
    clicks: {
      category: clicks("category_selected"),
      material: clicks("material_presented"),
      link: clicks("material_link_clicked"),
      next: clicks("next_material_clicked"),
      gift: clicks("gift_link_clicked"),
    },
    categoryClicks: {
      life: activity.filter((event) => event.event_name === "category_selected" && event.category === "life").length,
      business: activity.filter((event) => event.event_name === "category_selected" && event.category === "business").length,
    },
    topMaterials: [...materialClicks]
      .map(([title, count]) => ({ title, clicks: count }))
      .sort((a, b) => b.clicks - a.clicks)
      .slice(0, 3),
  };
}
