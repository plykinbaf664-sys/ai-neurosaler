import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import seedDatabase from "@/data/local-db.seed.json";

type LeadRow = {
  id: string;
  expert_profile_id: string | null;
  telegram_user_id: number;
  telegram_chat_id: number;
  telegram_username: string | null;
  first_name: string | null;
  last_name: string | null;
  source: string;
  status: string;
  current_stage: string;
  matched_offer: string | null;
  last_user_message: string | null;
  warmth_level: string;
  gift_link_clicked_at: string | null;
  gift_followup_due_at: string | null;
  gift_followup_sent_at: string | null;
  created_at: string;
  updated_at: string;
};

type ExpertProfileRow = {
  id: string;
  is_active: boolean;
  expert_name: string;
  brand_name: string | null;
  role_description: string | null;
  core_positioning: string | null;
  target_audience: string | null;
  communication_rules: string | null;
  do_not_say_rules: string | null;
  welcome_message: string;
  gift_message: string;
  gift_type: "link";
  gift_url: string;
  first_qual_question: string;
  created_at: string;
  updated_at: string;
};

type ExpertOfferRow = {
  id: string;
  expert_profile_id: string;
  title: string;
  description: string | null;
  price_text: string | null;
  cta_text: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

type ExpertFaqRow = {
  id: string;
  expert_profile_id: string;
  question: string;
  answer: string;
  sort_order: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

type ExpertObjectionRow = {
  id: string;
  expert_profile_id: string;
  objection: string;
  response: string;
  sort_order: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

type MessageRow = {
  id: string;
  lead_id: string;
  expert_profile_id: string | null;
  direction: "incoming" | "outgoing";
  channel: "telegram";
  telegram_message_id: number | null;
  text: string;
  message_type:
    | "user"
    | "welcome"
    | "gift"
    | "qual_question"
    | "gift_followup"
    | "library_followup"
    | "ai_reply";
  created_at: string;
};

type LeadMaterialRow = {
  id: string;
  lead_id: string | null;
  material_type: "pdf" | "url" | "text" | "unknown";
  source_url: string | null;
  telegram_file_id: string | null;
  file_name: string | null;
  raw_text: string | null;
  analysis: string | null;
  status: "received" | "analyzed" | "failed";
  created_at: string;
};

type LeadUpsertInput = {
  expertProfileId: string | null;
  telegramUserId: number;
  telegramChatId: number;
  telegramUsername: string | null;
  firstName: string | null;
  lastName: string | null;
  source: string;
  status: string;
  currentStage: string;
  matchedOffer: string | null;
  lastUserMessage: string | null;
  warmthLevel: string;
  giftLinkClickedAt?: string | null;
  giftFollowupDueAt?: string | null;
  giftFollowupSentAt?: string | null;
};

type LeadMaterialInsertInput = {
  leadId: string;
  materialType: "pdf" | "url" | "text" | "unknown";
  sourceUrl?: string | null;
  telegramFileId?: string | null;
  fileName?: string | null;
  rawText?: string | null;
  analysis?: string | null;
  status?: "received" | "analyzed" | "failed";
};

type MessageInsertInput = {
  leadId: string;
  expertProfileId: string | null;
  direction: "incoming" | "outgoing";
  channel: "telegram";
  telegramMessageId: number | null;
  text: string;
  messageType:
    | "user"
    | "welcome"
    | "gift"
    | "qual_question"
    | "gift_followup"
    | "library_followup"
    | "ai_reply";
};

type RuntimeSettings = {
  entryFlowMode: "quiz" | "gift";
  giftFollowupsEnabled: boolean;
};

type LibraryMaterialRow = {
  id: string;
  slug: string;
  title: string;
  short_description: string;
  category: string;
  topic: string;
  url: string;
  position: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

type LibraryProgressStatus = "not_started" | "opened" | "completed";

type LibraryProgressRow = {
  id: string;
  user_id: string;
  material_id: string;
  status: LibraryProgressStatus;
  created_at: string;
  updated_at: string;
};

type UserEventName =
  | "library_opened"
  | "category_selected"
  | "material_opened"
  | "material_presented"
  | "material_completed"
  | "next_material_clicked"
  | "library_returned"
  | "library_dialogue_message"
  | "library_followup_sent"
  | "reward_unlocked";

type UserEventRow = {
  id: string;
  user_id: string;
  event_name: UserEventName;
  material_id: string | null;
  category: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
};

type ConversationRoute = "marketing" | "life" | "business";

type UserLibraryProfileRow = {
  user_id: string;
  selected_categories: string[];
  opened_topics: string[];
  completed_topics: string[];
  last_route: ConversationRoute | null;
  last_category: "life" | "business" | null;
  last_material_slug: string | null;
  last_material_title: string | null;
  last_material_status: "opened" | "completed" | null;
  completed_count: number;
  engagement_score: number;
  last_followup_type: string | null;
  last_user_intent: string | null;
  last_interaction_at: string;
  last_followup_sent_at: string | null;
  next_followup_due_at: string | null;
  updated_at: string;
};

type UserLibraryProfilePatch = Partial<Omit<UserLibraryProfileRow, "user_id" | "updated_at">>;

type LocalDatabase = {
  version: number;
  runtimeSettings?: RuntimeSettings;
  expertProfiles: ExpertProfileRow[];
  expertOffers: ExpertOfferRow[];
  expertFaq: ExpertFaqRow[];
  expertObjections: ExpertObjectionRow[];
  leads: LeadRow[];
  messages: MessageRow[];
  leadMaterials: LeadMaterialRow[];
  libraryMaterials: LibraryMaterialRow[];
  libraryProgress: LibraryProgressRow[];
  userEvents: UserEventRow[];
  userLibraryProfiles: UserLibraryProfileRow[];
};

type LocalStoreRuntime = {
  databasePromise: Promise<LocalDatabase> | null;
  writeQueue: Promise<void>;
};

const runtimeKey = Symbol.for("ai-neurosaler.local-store");
const globalWithStore = globalThis as typeof globalThis & {
  [runtimeKey]?: LocalStoreRuntime;
};

function getRuntime() {
  globalWithStore[runtimeKey] ??= {
    databasePromise: null,
    writeQueue: Promise.resolve(),
  };

  return globalWithStore[runtimeKey];
}

function getStoreMode() {
  if (process.env.LOCAL_DATA_MODE === "memory" || process.env.LOCAL_DATA_MODE === "file") {
    return process.env.LOCAL_DATA_MODE;
  }

  return process.env.VERCEL ? "memory" : "file";
}

function getDataFilePath() {
  return path.join(process.cwd(), ".data", "neurosaler.json");
}

function cloneSeedDatabase() {
  return structuredClone(seedDatabase) as LocalDatabase;
}

function ensureLibraryCollections(database: LocalDatabase) {
  const seed = cloneSeedDatabase();
  const seededMaterials = seed.libraryMaterials ?? [];

  if (!Array.isArray(database.libraryMaterials) || database.libraryMaterials.length === 0) {
    database.libraryMaterials = seededMaterials;
  } else {
    for (const seededMaterial of seededMaterials) {
      const existing = database.libraryMaterials.find(
        (material) =>
          material.category === seededMaterial.category && material.slug === seededMaterial.slug,
      );

      if (existing) Object.assign(existing, seededMaterial);
      else database.libraryMaterials.push(seededMaterial);
    }

    for (const material of database.libraryMaterials) {
      if (
        (material.category === "life" &&
          (material.slug === "ai-life-start" || material.slug === "ai-life-focus")) ||
        (material.category === "business" &&
          (material.slug === "ai-business-start" || material.slug === "business-routine-automation"))
      ) {
        material.is_active = false;
      }
    }
  }
  database.libraryProgress ??= [];
  database.userEvents ??= [];
  database.userLibraryProfiles ??= [];
  return database;
}

function applyEnvironmentOverrides(database: LocalDatabase) {
  const activeProfile = database.expertProfiles.find((profile) => profile.is_active);
  const giftUrl = process.env.NEIRO_GIFT_URL?.trim();

  if (activeProfile && giftUrl) {
    activeProfile.gift_url = giftUrl;
  }

  return database;
}

function isConfiguredUrl(value: string | null | undefined) {
  if (!value) {
    return false;
  }

  try {
    const url = new URL(value);
    return (url.protocol === "https:" || url.protocol === "http:") && url.hostname !== "example.com";
  } catch {
    return false;
  }
}

function isLocalDatabase(value: unknown): value is LocalDatabase {
  if (!value || typeof value !== "object") {
    return false;
  }

  const database = value as Partial<LocalDatabase>;
  return (
    database.version === 1 &&
    Array.isArray(database.expertProfiles) &&
    Array.isArray(database.expertOffers) &&
    Array.isArray(database.expertFaq) &&
    Array.isArray(database.expertObjections) &&
    Array.isArray(database.leads) &&
    Array.isArray(database.messages) &&
    Array.isArray(database.leadMaterials)
  );
}

async function persistDatabase(database: LocalDatabase) {
  if (getStoreMode() === "memory") {
    return;
  }

  const dataFilePath = getDataFilePath();
  await mkdir(path.dirname(dataFilePath), { recursive: true });
  await writeFile(dataFilePath, `${JSON.stringify(database, null, 2)}\n`, "utf8");
}

async function loadDatabase() {
  if (getStoreMode() === "memory") {
    return applyEnvironmentOverrides(ensureLibraryCollections(cloneSeedDatabase()));
  }

  const dataFilePath = getDataFilePath();

  try {
    const parsed = JSON.parse(await readFile(dataFilePath, "utf8")) as unknown;

    if (!isLocalDatabase(parsed)) {
      throw new Error(`Unsupported local data schema in ${dataFilePath}.`);
    }

    return applyEnvironmentOverrides(ensureLibraryCollections(parsed));
  } catch (error) {
    const code = error && typeof error === "object" && "code" in error ? error.code : null;

    if (code !== "ENOENT") {
      throw error;
    }

    const database = applyEnvironmentOverrides(ensureLibraryCollections(cloneSeedDatabase()));
    await persistDatabase(database);
    return database;
  }
}

async function getDatabase() {
  const runtime = getRuntime();
  runtime.databasePromise ??= loadDatabase();
  return runtime.databasePromise;
}

async function readDatabase<T>(reader: (database: LocalDatabase) => T) {
  const runtime = getRuntime();
  await runtime.writeQueue;
  return reader(await getDatabase());
}

async function mutateDatabase<T>(mutator: (database: LocalDatabase) => T) {
  const runtime = getRuntime();
  const previousWrite = runtime.writeQueue;
  let releaseWrite: () => void = () => undefined;
  runtime.writeQueue = new Promise<void>((resolve) => {
    releaseWrite = resolve;
  });

  await previousWrite;

  try {
    const database = await getDatabase();
    const result = mutator(database);
    await persistDatabase(database);
    return result;
  } finally {
    releaseWrite();
  }
}

export async function getActiveExpertProfile() {
  return readDatabase((database) => database.expertProfiles.find((profile) => profile.is_active) ?? null);
}

export async function getActiveExpertOffers(expertProfileId: string) {
  return readDatabase((database) =>
    database.expertOffers
      .filter((offer) => offer.expert_profile_id === expertProfileId && offer.is_active)
      .sort((a, b) => a.created_at.localeCompare(b.created_at)),
  );
}

export async function getActiveExpertFaq(expertProfileId: string) {
  return readDatabase((database) =>
    database.expertFaq
      .filter((item) => item.expert_profile_id === expertProfileId && item.is_active)
      .sort((a, b) => a.sort_order - b.sort_order || a.created_at.localeCompare(b.created_at)),
  );
}

export async function getActiveExpertObjections(expertProfileId: string) {
  return readDatabase((database) =>
    database.expertObjections
      .filter((item) => item.expert_profile_id === expertProfileId && item.is_active)
      .sort((a, b) => a.sort_order - b.sort_order || a.created_at.localeCompare(b.created_at)),
  );
}

export async function getLeadByTelegramUserId(telegramUserId: number) {
  return readDatabase(
    (database) => database.leads.find((lead) => lead.telegram_user_id === telegramUserId) ?? null,
  );
}

export async function getLeadById(leadId: string) {
  return readDatabase((database) => database.leads.find((lead) => lead.id === leadId) ?? null);
}

export async function getDueGiftFollowupLeads(nowIso: string, limit = 20) {
  return readDatabase((database) =>
    database.leads
      .filter(
        (lead) =>
          Boolean(lead.gift_followup_due_at) &&
          lead.gift_followup_due_at! <= nowIso &&
          !lead.gift_link_clicked_at &&
          !lead.gift_followup_sent_at,
      )
      .sort((a, b) => a.gift_followup_due_at!.localeCompare(b.gift_followup_due_at!))
      .slice(0, limit),
  );
}

export async function getRecentMessagesByLeadId(leadId: string, limit = 10) {
  return readDatabase((database) =>
    database.messages
      .filter((message) => message.lead_id === leadId)
      .sort((a, b) => b.created_at.localeCompare(a.created_at))
      .slice(0, limit),
  );
}

export async function getLeadMaterialsCount(leadId: string) {
  return readDatabase(
    (database) => database.leadMaterials.filter((material) => material.lead_id === leadId).length,
  );
}

export async function createLeadMaterial(input: LeadMaterialInsertInput) {
  return mutateDatabase((database) => {
    const material: LeadMaterialRow = {
      id: randomUUID(),
      lead_id: input.leadId,
      material_type: input.materialType,
      source_url: input.sourceUrl ?? null,
      telegram_file_id: input.telegramFileId ?? null,
      file_name: input.fileName ?? null,
      raw_text: input.rawText ?? null,
      analysis: input.analysis ?? null,
      status: input.status ?? "received",
      created_at: new Date().toISOString(),
    };

    database.leadMaterials.push(material);
    return material;
  });
}

export async function updateLeadMaterialById(
  materialId: string,
  input: Partial<Pick<LeadMaterialInsertInput, "analysis" | "status" | "rawText">>,
) {
  return mutateDatabase((database) => {
    const material = database.leadMaterials.find((item) => item.id === materialId);

    if (!material) {
      return null;
    }

    if (input.analysis !== undefined) material.analysis = input.analysis;
    if (input.status !== undefined) material.status = input.status;
    if (input.rawText !== undefined) material.raw_text = input.rawText;
    return material;
  });
}

export async function createLead(input: LeadUpsertInput) {
  return mutateDatabase((database) => {
    const existingLead = database.leads.find((lead) => lead.telegram_user_id === input.telegramUserId);

    if (existingLead) {
      throw new Error(`Lead for Telegram user ${input.telegramUserId} already exists.`);
    }

    const now = new Date().toISOString();
    const lead: LeadRow = {
      id: randomUUID(),
      expert_profile_id: input.expertProfileId,
      telegram_user_id: input.telegramUserId,
      telegram_chat_id: input.telegramChatId,
      telegram_username: input.telegramUsername,
      first_name: input.firstName,
      last_name: input.lastName,
      source: input.source,
      status: input.status,
      current_stage: input.currentStage,
      matched_offer: input.matchedOffer,
      last_user_message: input.lastUserMessage,
      warmth_level: input.warmthLevel,
      gift_link_clicked_at: input.giftLinkClickedAt ?? null,
      gift_followup_due_at: input.giftFollowupDueAt ?? null,
      gift_followup_sent_at: input.giftFollowupSentAt ?? null,
      created_at: now,
      updated_at: now,
    };

    database.leads.push(lead);
    return lead;
  });
}

export async function updateLeadById(leadId: string, input: Partial<LeadUpsertInput>) {
  return mutateDatabase((database) => {
    const lead = database.leads.find((item) => item.id === leadId);

    if (!lead) {
      return null;
    }

    if (input.expertProfileId !== undefined) lead.expert_profile_id = input.expertProfileId;
    if (input.telegramUserId !== undefined) lead.telegram_user_id = input.telegramUserId;
    if (input.telegramChatId !== undefined) lead.telegram_chat_id = input.telegramChatId;
    if (input.telegramUsername !== undefined) lead.telegram_username = input.telegramUsername;
    if (input.firstName !== undefined) lead.first_name = input.firstName;
    if (input.lastName !== undefined) lead.last_name = input.lastName;
    if (input.source !== undefined) lead.source = input.source;
    if (input.status !== undefined) lead.status = input.status;
    if (input.currentStage !== undefined) lead.current_stage = input.currentStage;
    if (input.matchedOffer !== undefined) lead.matched_offer = input.matchedOffer;
    if (input.lastUserMessage !== undefined) lead.last_user_message = input.lastUserMessage;
    if (input.warmthLevel !== undefined) lead.warmth_level = input.warmthLevel;
    if (input.giftLinkClickedAt !== undefined) lead.gift_link_clicked_at = input.giftLinkClickedAt;
    if (input.giftFollowupDueAt !== undefined) lead.gift_followup_due_at = input.giftFollowupDueAt;
    if (input.giftFollowupSentAt !== undefined) lead.gift_followup_sent_at = input.giftFollowupSentAt;
    lead.updated_at = new Date().toISOString();
    return lead;
  });
}

export async function insertMessage(input: MessageInsertInput) {
  return mutateDatabase((database) => {
    const message: MessageRow = {
      id: randomUUID(),
      lead_id: input.leadId,
      expert_profile_id: input.expertProfileId,
      direction: input.direction,
      channel: input.channel,
      telegram_message_id: input.telegramMessageId,
      text: input.text,
      message_type: input.messageType,
      created_at: new Date().toISOString(),
    };

    database.messages.push(message);
    return message;
  });
}

export async function pruneMessagesByLeadId(leadId: string, keep: number) {
  return mutateDatabase((database) => {
    const keptIds = new Set(
      database.messages
        .filter((message) => message.lead_id === leadId)
        .sort((a, b) => b.created_at.localeCompare(a.created_at))
        .slice(0, keep)
        .map((message) => message.id),
    );
    database.messages = database.messages.filter(
      (message) => message.lead_id !== leadId || keptIds.has(message.id),
    );
  });
}

export async function getLocalStoreSummary() {
  return readDatabase((database) => ({
    mode: getStoreMode(),
    file: getStoreMode() === "file" ? getDataFilePath() : null,
    expert: database.expertProfiles.find((profile) => profile.is_active)?.expert_name ?? null,
    giftReady: isConfiguredUrl(database.expertProfiles.find((profile) => profile.is_active)?.gift_url),
    offers: database.expertOffers.filter((offer) => offer.is_active).length,
    faq: database.expertFaq.filter((item) => item.is_active).length,
    objections: database.expertObjections.filter((item) => item.is_active).length,
    leads: database.leads.length,
    messages: database.messages.length,
    materials: database.leadMaterials.length,
  }));
}

function getDefaultRuntimeSettings(): RuntimeSettings {
  return {
    entryFlowMode: process.env.NEIRO_ENTRY_FLOW_MODE === "gift" ? "gift" : "quiz",
    giftFollowupsEnabled: process.env.GIFT_FOLLOWUPS_ENABLED !== "false",
  };
}

export async function getRuntimeSettings() {
  return readDatabase((database) => database.runtimeSettings ?? getDefaultRuntimeSettings());
}

export async function updateRuntimeSettings(input: Partial<RuntimeSettings>) {
  return mutateDatabase((database) => {
    const current = database.runtimeSettings ?? getDefaultRuntimeSettings();
    database.runtimeSettings = { ...current, ...input };
    return database.runtimeSettings;
  });
}

export async function getAdminOverview() {
  return readDatabase((database) => {
    const now = Date.now();
    const dayAgo = now - 24 * 60 * 60 * 1000;
    const weekAgo = now - 7 * 24 * 60 * 60 * 1000;
    const qualified = database.leads.filter((lead) =>
      ["qualified", "needs_manual_followup"].includes(lead.status),
    ).length;
    const converted = database.leads.filter(
      (lead) =>
        lead.status === "needs_manual_followup" ||
        /(booked|confirmed|handoff)/.test(lead.current_stage),
    ).length;

    return {
      totalLeads: database.leads.length,
      leadsToday: database.leads.filter((lead) => Date.parse(lead.created_at) >= dayAgo).length,
      leadsWeek: database.leads.filter((lead) => Date.parse(lead.created_at) >= weekAgo).length,
      qualified,
      converted,
      qualificationRate: database.leads.length ? Math.round((qualified / database.leads.length) * 100) : 0,
      conversionRate: database.leads.length ? Math.round((converted / database.leads.length) * 100) : 0,
      dialogues: new Set(database.messages.map((message) => message.lead_id)).size,
      incomingMessages: database.messages.filter((message) => message.direction === "incoming").length,
      outgoingMessages: database.messages.filter((message) => message.direction === "outgoing").length,
    };
  });
}

export async function getAdminLeads() {
  return readDatabase((database) =>
    [...database.leads]
      .sort((a, b) => b.updated_at.localeCompare(a.updated_at))
      .map((lead) => {
        const messages = database.messages.filter((message) => message.lead_id === lead.id);
        return {
          ...lead,
          messageCount: messages.length,
          lastMessageAt: messages.sort((a, b) => b.created_at.localeCompare(a.created_at))[0]?.created_at ?? null,
        };
      }),
  );
}

export async function getRecentLeadDialogues(limit = 8) {
  const leads = await getAdminLeads();
  return leads.filter((lead) => lead.messageCount > 0).slice(0, limit);
}

export async function getLeadDialogue(leadId: string, limit = 12) {
  return readDatabase((database) => {
    const lead = database.leads.find((item) => item.id === leadId) ?? null;
    const messages = database.messages
      .filter((message) => message.lead_id === leadId)
      .sort((a, b) => b.created_at.localeCompare(a.created_at))
      .slice(0, limit)
      .reverse();
    return { lead, messages };
  });
}

export async function getActiveLibraryMaterials(category?: string) {
  return readDatabase((database) =>
    database.libraryMaterials
      .filter((material) => material.is_active && (!category || material.category === category))
      .sort((a, b) => a.position - b.position || a.created_at.localeCompare(b.created_at)),
  );
}

export async function getLibraryMaterialById(materialId: string) {
  return readDatabase(
    (database) => database.libraryMaterials.find((material) => material.id === materialId) ?? null,
  );
}

export async function getActiveLibraryMaterialBySlug(category: string, slug: string) {
  return readDatabase(
    (database) =>
      database.libraryMaterials.find(
        (material) => material.is_active && material.category === category && material.slug === slug,
      ) ?? null,
  );
}

export async function getLibraryProgress(userId: string, materialIds: string[]) {
  const ids = new Set(materialIds);
  return readDatabase((database) =>
    database.libraryProgress.filter(
      (progress) => progress.user_id === userId && ids.has(progress.material_id),
    ),
  );
}

export async function upsertLibraryProgress(
  userId: string,
  materialId: string,
  status: LibraryProgressStatus,
) {
  return mutateDatabase((database) => {
    const existing = database.libraryProgress.find(
      (progress) => progress.user_id === userId && progress.material_id === materialId,
    );
    const rank: Record<LibraryProgressStatus, number> = { not_started: 0, opened: 1, completed: 2 };
    const now = new Date().toISOString();

    if (existing) {
      if (rank[status] > rank[existing.status]) existing.status = status;
      existing.updated_at = now;
      return existing;
    }

    const progress: LibraryProgressRow = {
      id: randomUUID(),
      user_id: userId,
      material_id: materialId,
      status,
      created_at: now,
      updated_at: now,
    };
    database.libraryProgress.push(progress);
    return progress;
  });
}

export async function insertUserEvent(input: {
  userId: string;
  eventName: UserEventName;
  materialId?: string | null;
  category?: string | null;
  metadata?: Record<string, unknown>;
}) {
  return mutateDatabase((database) => {
    const event: UserEventRow = {
      id: randomUUID(),
      user_id: input.userId,
      event_name: input.eventName,
      material_id: input.materialId ?? null,
      category: input.category ?? null,
      metadata: input.metadata ?? {},
      created_at: new Date().toISOString(),
    };
    database.userEvents.push(event);
    return event;
  });
}

export async function hasUserEvent(userId: string, eventName: UserEventName, category?: string | null) {
  return readDatabase((database) =>
    database.userEvents.some(
      (event) =>
        event.user_id === userId &&
        event.event_name === eventName &&
        (category === undefined || event.category === category),
    ),
  );
}

export async function getRecentUserEvents(userId: string, limit = 100) {
  return readDatabase((database) =>
    database.userEvents
      .filter((event) => event.user_id === userId)
      .sort((a, b) => b.created_at.localeCompare(a.created_at))
      .slice(0, limit),
  );
}

export async function getUserLibraryProfile(userId: string) {
  return readDatabase(
    (database) => database.userLibraryProfiles.find((profile) => profile.user_id === userId) ?? null,
  );
}

export async function upsertUserLibraryProfile(userId: string, input: UserLibraryProfilePatch) {
  return mutateDatabase((database) => {
    const now = new Date().toISOString();
    let profile = database.userLibraryProfiles.find((item) => item.user_id === userId);

    if (!profile) {
      profile = {
        user_id: userId,
        selected_categories: [],
        opened_topics: [],
        completed_topics: [],
        last_route: null,
        last_category: null,
        last_material_slug: null,
        last_material_title: null,
        last_material_status: null,
        completed_count: 0,
        engagement_score: 0,
        last_followup_type: null,
        last_user_intent: null,
        last_interaction_at: now,
        last_followup_sent_at: null,
        next_followup_due_at: null,
        updated_at: now,
      };
      database.userLibraryProfiles.push(profile);
    }

    Object.assign(profile, input, { updated_at: now });
    return profile;
  });
}

export async function getDueLibraryFollowupProfiles(nowIso: string, limit = 20) {
  return readDatabase((database) =>
    database.userLibraryProfiles
      .filter(
        (profile) =>
          Boolean(profile.next_followup_due_at) && profile.next_followup_due_at! <= nowIso,
      )
      .sort((a, b) => a.next_followup_due_at!.localeCompare(b.next_followup_due_at!))
      .slice(0, limit),
  );
}

export type {
  ExpertFaqRow,
  ExpertObjectionRow,
  ExpertOfferRow,
  ExpertProfileRow,
  LeadMaterialRow,
  LeadRow,
  LibraryMaterialRow,
  LibraryProgressRow,
  LibraryProgressStatus,
  MessageRow,
  RuntimeSettings,
  UserEventRow,
  UserLibraryProfileRow,
};
