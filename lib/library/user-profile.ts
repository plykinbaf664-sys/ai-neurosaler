import "server-only";

import {
  getRecentUserEvents,
  getUserLibraryProfile,
  upsertUserLibraryProfile,
  type ConversationRoute,
  type UserEventRow,
  type UserLibraryProfilePatch,
} from "@/lib/storage";
import { trackUserEvent } from "@/lib/tracking/events";

const PROFILE_EVENT_LIMIT = 200;
const PROFILE_LIST_LIMIT = 20;

function metadataText(event: UserEventRow | undefined, key: string) {
  if (!event) return "";
  const value = event.metadata[key];
  return typeof value === "string" ? value.trim() : "";
}

function unique(values: string[]) {
  return [...new Set(values.map((value) => value.trim().toLowerCase()).filter(Boolean))].slice(
    0,
    PROFILE_LIST_LIMIT,
  );
}

function topicParts(events: UserEventRow[]) {
  return unique(
    events.flatMap((event) =>
      metadataText(event, "topic")
        .split("/")
        .map((topic) => topic.trim()),
    ),
  );
}

function materialKey(event: UserEventRow) {
  return event.material_id ?? metadataText(event, "slug");
}

export function getLibraryUserProfile(userId: string) {
  return getUserLibraryProfile(userId);
}

export async function refreshLibraryUserProfile(userId: string) {
  const [events, current] = await Promise.all([
    getRecentUserEvents(userId, PROFILE_EVENT_LIMIT),
    getUserLibraryProfile(userId),
  ]);
  const selectedEvents = events.filter((event) => event.event_name === "category_selected");
  const openedEvents = events.filter((event) => event.event_name === "material_opened");
  const completedEvents = events.filter((event) => event.event_name === "material_completed");
  const lastMaterialEvent = events.find(
    (event) =>
      event.event_name === "material_presented" ||
      event.event_name === "material_opened" ||
      event.event_name === "material_completed",
  );
  const lastRouteEvent = events.find(
    (event) =>
      event.event_name === "category_selected" ||
      event.event_name === "material_presented" ||
      event.event_name === "material_opened" ||
      event.event_name === "material_completed" ||
      event.event_name === "library_dialogue_message",
  );
  const lastInteractionEvent = events.find((event) => event.event_name !== "library_followup_sent");
  const completedKeys = unique(completedEvents.map(materialKey));
  const openedKeys = unique(openedEvents.map(materialKey));
  const routeCandidate = lastRouteEvent
    ? metadataText(lastRouteEvent, "route") || lastRouteEvent.category
    : current?.last_route;
  const lastRoute: ConversationRoute | null =
    routeCandidate === "life" || routeCandidate === "business" || routeCandidate === "marketing"
      ? routeCandidate
      : current?.last_route ?? null;

  return upsertUserLibraryProfile(userId, {
    selected_categories: unique(selectedEvents.map((event) => event.category ?? "")),
    opened_topics: topicParts(openedEvents),
    completed_topics: topicParts(completedEvents),
    last_route: lastRoute,
    last_category:
      lastMaterialEvent?.category === "life" || lastMaterialEvent?.category === "business"
        ? lastMaterialEvent.category
        : current?.last_category ?? null,
    last_material_slug: lastMaterialEvent
      ? metadataText(lastMaterialEvent, "slug") || current?.last_material_slug || null
      : current?.last_material_slug ?? null,
    last_material_title: lastMaterialEvent
      ? metadataText(lastMaterialEvent, "title") || current?.last_material_title || null
      : current?.last_material_title ?? null,
    last_material_status:
      metadataText(lastMaterialEvent, "status") === "completed" ||
      lastMaterialEvent?.event_name === "material_completed"
        ? "completed"
        : lastMaterialEvent?.event_name === "material_opened" ||
            metadataText(lastMaterialEvent, "status") === "opened"
          ? "opened"
          : lastMaterialEvent?.event_name === "material_presented"
            ? null
            : current?.last_material_status ?? null,
    completed_count: completedKeys.length,
    engagement_score: Math.min(100, selectedEvents.length + openedKeys.length + completedKeys.length * 2),
    last_interaction_at: lastInteractionEvent?.created_at ?? current?.last_interaction_at ?? new Date().toISOString(),
  });
}

export function updateLibraryConversationContext(userId: string, input: UserLibraryProfilePatch) {
  return upsertUserLibraryProfile(userId, input);
}

export async function setConversationRoute(userId: string, route: ConversationRoute) {
  const now = new Date().toISOString();
  return upsertUserLibraryProfile(userId, {
    last_route: route,
    last_category: route === "life" || route === "business" ? route : null,
    last_interaction_at: now,
  });
}

export type LibraryUserIntent =
  | "postponed"
  | "tried"
  | "confused"
  | "recommendation"
  | "material_question"
  | "reminder_request"
  | "smalltalk"
  | "other";

export function detectLibraryUserIntent(text: string): LibraryUserIntent {
  const normalized = text.trim().toLowerCase().replaceAll("ё", "е");
  if (/(сохранил|потом посмотр|еще не смотр|не посмотр|не успел|не открывал)/.test(normalized)) {
    return "postponed";
  }
  if (/(попробовал|сделал|прочитал|посмотрел|получилось)/.test(normalized)) return "tried";
  if (/(не понял|непонят|не зашло|не работает)/.test(normalized)) return "confused";
  if (/(напомни|напомнить)/.test(normalized)) return "reminder_request";
  if (/(что посовету|что дальше|дальше посмотр|следующ)/.test(normalized)) return "recommendation";
  if (/(что это|что за материал|про что|о чем|материал)/.test(normalized)) return "material_question";
  if (/(как дела|как у тебя дела|как ты|привет|спасибо)/.test(normalized)) return "smalltalk";
  return "other";
}

export async function rememberLibraryUserMessage(
  userId: string,
  route: "life" | "business",
  text: string,
) {
  const intent = detectLibraryUserIntent(text);
  const now = new Date().toISOString();
  await trackUserEvent({
    userId,
    eventName: "library_dialogue_message",
    category: route,
    metadata: { route, intent },
  });
  await upsertUserLibraryProfile(userId, {
    last_route: route,
    last_category: route,
    last_user_intent: intent,
    last_interaction_at: now,
  });
  return intent;
}
