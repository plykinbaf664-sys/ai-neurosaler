import "server-only";

import {
  MAX_MATERIALS_PER_LEAD,
  MAX_MATERIAL_TEXT_CHARS,
  MAX_MESSAGE_HISTORY,
  MAX_STORED_MESSAGE_CHARS,
  truncateStoredText,
} from "@/lib/storage/limits";
import type {
  AdminLeadRow,
  ExpertFaqRow,
  ExpertObjectionRow,
  ExpertOfferRow,
  ExpertProfileRow,
  LeadMaterialInsertInput,
  LeadRow,
  LeadUpsertInput,
  LibraryMaterialRow,
  LibraryProgressRow,
  LibraryProgressStatus,
  MessageInsertInput,
  MessageRow,
  RuntimeSettings,
  StorageAdapter,
  UserEventInsertInput,
} from "@/lib/storage/types";

const PROFILE_COLUMNS =
  "id,is_active,expert_name,brand_name,role_description,core_positioning,target_audience,communication_rules,do_not_say_rules,welcome_message,gift_message,gift_type,gift_url,first_qual_question,created_at,updated_at";
const OFFER_COLUMNS =
  "id,expert_profile_id,title,description,price_text,cta_text,is_active,created_at,updated_at";
const FAQ_COLUMNS =
  "id,expert_profile_id,question,answer,sort_order,is_active,created_at,updated_at";
const OBJECTION_COLUMNS =
  "id,expert_profile_id,objection,response,sort_order,is_active,created_at,updated_at";
const LEAD_COLUMNS =
  "id,expert_profile_id,telegram_user_id,telegram_chat_id,telegram_username,first_name,last_name,source,status,current_stage,matched_offer,last_user_message,warmth_level,gift_link_clicked_at,gift_followup_due_at,gift_followup_sent_at,created_at,updated_at";
const MESSAGE_COLUMNS =
  "id,lead_id,expert_profile_id,direction,channel,telegram_message_id,text,message_type,created_at";
const LIBRARY_MATERIAL_COLUMNS =
  "id,slug,title,short_description,category,topic,url,position,is_active,created_at,updated_at";
const LIBRARY_PROGRESS_COLUMNS = "id,user_id,material_id,status,created_at,updated_at";

type QueryValue = string | number | boolean | undefined;

function getSupabaseConfig() {
  const url = process.env.SUPABASE_URL?.trim().replace(/\/$/, "");
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();

  if (!url || !serviceRoleKey) {
    throw new Error("Supabase storage requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.");
  }

  return { url, serviceRoleKey };
}

function buildUrl(resource: string, query: Record<string, QueryValue> = {}) {
  const { url } = getSupabaseConfig();
  const requestUrl = new URL(`${url}/rest/v1/${resource}`);

  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined) requestUrl.searchParams.set(key, String(value));
  }

  return requestUrl;
}

async function supabaseRequest<T>(
  resource: string,
  query: Record<string, QueryValue> = {},
  init: { method?: string; body?: unknown; prefer?: string } = {},
) {
  const { serviceRoleKey } = getSupabaseConfig();
  const response = await fetch(buildUrl(resource, query), {
    method: init.method ?? "GET",
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      Accept: "application/json",
      ...(init.body === undefined ? {} : { "Content-Type": "application/json" }),
      ...(init.prefer ? { Prefer: init.prefer } : {}),
    },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
    cache: "no-store",
  });

  if (!response.ok) {
    const detail = (await response.text()).slice(0, 600);
    throw new Error(`Supabase ${init.method ?? "GET"} ${resource} failed (${response.status}): ${detail}`);
  }

  if (response.status === 204 || init.method === "HEAD") {
    return { data: undefined as T, response };
  }

  return { data: (await response.json()) as T, response };
}

async function selectRows<T>(resource: string, query: Record<string, QueryValue>) {
  return (await supabaseRequest<T[]>(resource, query)).data;
}

async function selectOne<T>(resource: string, query: Record<string, QueryValue>) {
  const rows = await selectRows<T>(resource, { ...query, limit: 1 });
  return rows[0] ?? null;
}

async function countRows(resource: string, query: Record<string, QueryValue> = {}) {
  const { response } = await supabaseRequest<never>(
    resource,
    { ...query, select: "id" },
    { method: "HEAD", prefer: "count=exact" },
  );
  const contentRange = response.headers.get("content-range");
  const count = Number.parseInt(contentRange?.split("/")[1] ?? "0", 10);
  return Number.isFinite(count) ? count : 0;
}

function isConfiguredUrl(value: string | null | undefined) {
  if (!value) return false;

  try {
    const url = new URL(value);
    return (url.protocol === "https:" || url.protocol === "http:") && url.hostname !== "example.com";
  } catch {
    return false;
  }
}

function applyProfileOverrides(profile: ExpertProfileRow | null) {
  const giftUrl = process.env.NEIRO_GIFT_URL?.trim();
  return profile && giftUrl ? { ...profile, gift_url: giftUrl } : profile;
}

function leadPayload(input: LeadUpsertInput) {
  return {
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
    ...(input.giftLinkClickedAt === undefined ? {} : { gift_link_clicked_at: input.giftLinkClickedAt }),
    ...(input.giftFollowupDueAt === undefined ? {} : { gift_followup_due_at: input.giftFollowupDueAt }),
    ...(input.giftFollowupSentAt === undefined ? {} : { gift_followup_sent_at: input.giftFollowupSentAt }),
  };
}

function leadPatch(input: Partial<LeadUpsertInput>) {
  return Object.fromEntries(
    Object.entries({
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
      gift_link_clicked_at: input.giftLinkClickedAt,
      gift_followup_due_at: input.giftFollowupDueAt,
      gift_followup_sent_at: input.giftFollowupSentAt,
    }).filter(([, value]) => value !== undefined),
  );
}

function materialPayload(input: LeadMaterialInsertInput) {
  return {
    lead_id: input.leadId,
    material_type: input.materialType,
    source_url: truncateStoredText(input.sourceUrl, 2_048),
    telegram_file_id: truncateStoredText(input.telegramFileId, 512),
    file_name: truncateStoredText(input.fileName, 255),
    raw_text: truncateStoredText(input.rawText, MAX_MATERIAL_TEXT_CHARS),
    analysis: truncateStoredText(input.analysis, MAX_MATERIAL_TEXT_CHARS),
    status: input.status ?? "received",
  };
}

function getDefaultRuntimeSettings(): RuntimeSettings {
  return {
    entryFlowMode: process.env.NEIRO_ENTRY_FLOW_MODE === "gift" ? "gift" : "quiz",
    giftFollowupsEnabled: process.env.GIFT_FOLLOWUPS_ENABLED !== "false",
  };
}

const settingsKey = Symbol.for("ai-neurosaler.supabase-runtime-settings");
const globalWithSettings = globalThis as typeof globalThis & { [settingsKey]?: RuntimeSettings };

async function pruneSupabaseMessages(leadId: string) {
  const staleRows = await selectRows<{ id: string }>("messages", {
    select: "id",
    lead_id: `eq.${leadId}`,
    order: "created_at.desc",
    offset: MAX_MESSAGE_HISTORY,
    limit: 100,
  });

  if (!staleRows.length) return;
  await supabaseRequest("messages", { id: `in.(${staleRows.map((row) => row.id).join(",")})` }, { method: "DELETE" });
}

async function getSupabaseAdminLeads(): Promise<AdminLeadRow[]> {
  const leads = await selectRows<LeadRow>("leads", {
    select: LEAD_COLUMNS,
    order: "updated_at.desc",
    limit: 500,
  });

  if (!leads.length) return [];
  const ids = leads.map((lead) => lead.id);
  const messageMetadata = await selectRows<Pick<MessageRow, "lead_id" | "created_at">>("messages", {
    select: "lead_id,created_at",
    lead_id: `in.(${ids.join(",")})`,
    order: "created_at.desc",
    limit: Math.min(ids.length * MAX_MESSAGE_HISTORY, 5_000),
  });
  const metadataByLead = new Map<string, { count: number; last: string | null }>();

  for (const message of messageMetadata) {
    const current = metadataByLead.get(message.lead_id) ?? { count: 0, last: null };
    current.count += 1;
    current.last ??= message.created_at;
    metadataByLead.set(message.lead_id, current);
  }

  return leads.map((lead) => ({
    ...lead,
    messageCount: metadataByLead.get(lead.id)?.count ?? 0,
    lastMessageAt: metadataByLead.get(lead.id)?.last ?? null,
  }));
}

export const supabaseStorageAdapter: StorageAdapter = {
  async getActiveExpertProfile() {
    return applyProfileOverrides(
      await selectOne<ExpertProfileRow>("expert_profile", {
        select: PROFILE_COLUMNS,
        is_active: "eq.true",
        order: "updated_at.desc",
      }),
    );
  },
  getActiveExpertOffers(expertProfileId) {
    return selectRows<ExpertOfferRow>("expert_offers", {
      select: OFFER_COLUMNS,
      expert_profile_id: `eq.${expertProfileId}`,
      is_active: "eq.true",
      order: "created_at.asc",
      limit: 100,
    });
  },
  getActiveExpertFaq(expertProfileId) {
    return selectRows<ExpertFaqRow>("expert_faq", {
      select: FAQ_COLUMNS,
      expert_profile_id: `eq.${expertProfileId}`,
      is_active: "eq.true",
      order: "sort_order.asc,created_at.asc",
      limit: 100,
    });
  },
  getActiveExpertObjections(expertProfileId) {
    return selectRows<ExpertObjectionRow>("expert_objections", {
      select: OBJECTION_COLUMNS,
      expert_profile_id: `eq.${expertProfileId}`,
      is_active: "eq.true",
      order: "sort_order.asc,created_at.asc",
      limit: 100,
    });
  },
  getLeadByTelegramUserId(telegramUserId) {
    return selectOne<LeadRow>("leads", { select: LEAD_COLUMNS, telegram_user_id: `eq.${telegramUserId}` });
  },
  getLeadById(leadId) {
    return selectOne<LeadRow>("leads", { select: LEAD_COLUMNS, id: `eq.${leadId}` });
  },
  getDueGiftFollowupLeads(nowIso, limit = 20) {
    return selectRows<LeadRow>("leads", {
      select: LEAD_COLUMNS,
      gift_followup_due_at: `lte.${nowIso}`,
      gift_link_clicked_at: "is.null",
      gift_followup_sent_at: "is.null",
      order: "gift_followup_due_at.asc",
      limit: Math.min(limit, 100),
    });
  },
  getRecentMessagesByLeadId(leadId, limit = MAX_MESSAGE_HISTORY) {
    return selectRows<MessageRow>("messages", {
      select: MESSAGE_COLUMNS,
      lead_id: `eq.${leadId}`,
      order: "created_at.desc",
      limit: Math.min(limit, MAX_MESSAGE_HISTORY),
    });
  },
  getLeadMaterialsCount(leadId) {
    return countRows("lead_materials", { lead_id: `eq.${leadId}` });
  },
  async createLeadMaterial(input) {
    if ((await this.getLeadMaterialsCount(input.leadId)) >= MAX_MATERIALS_PER_LEAD) {
      throw new Error(`Lead material limit (${MAX_MATERIALS_PER_LEAD}) reached.`);
    }

    const rows = (
      await supabaseRequest<{ id: string }[]>(
        "lead_materials",
        { select: "id" },
        { method: "POST", body: materialPayload(input), prefer: "return=representation" },
      )
    ).data;
    return rows[0];
  },
  async updateLeadMaterialById(materialId, input) {
    const body = Object.fromEntries(
      Object.entries({
        analysis:
          input.analysis === undefined ? undefined : truncateStoredText(input.analysis, MAX_MATERIAL_TEXT_CHARS),
        status: input.status,
        raw_text:
          input.rawText === undefined ? undefined : truncateStoredText(input.rawText, MAX_MATERIAL_TEXT_CHARS),
      }).filter(([, value]) => value !== undefined),
    );
    const rows = (
      await supabaseRequest<{ id: string }[]>(
        "lead_materials",
        { id: `eq.${materialId}`, select: "id" },
        { method: "PATCH", body, prefer: "return=representation" },
      )
    ).data;
    return rows[0] ?? null;
  },
  async createLead(input) {
    const rows = (
      await supabaseRequest<LeadRow[]>(
        "leads",
        { select: LEAD_COLUMNS },
        { method: "POST", body: leadPayload(input), prefer: "return=representation" },
      )
    ).data;
    return rows[0];
  },
  async updateLeadById(leadId, input) {
    const rows = (
      await supabaseRequest<LeadRow[]>(
        "leads",
        { id: `eq.${leadId}`, select: LEAD_COLUMNS },
        { method: "PATCH", body: leadPatch(input), prefer: "return=representation" },
      )
    ).data;
    return rows[0] ?? null;
  },
  async insertMessage(input: MessageInsertInput) {
    const rows = (
      await supabaseRequest<{ id: string }[]>(
        "messages",
        { select: "id" },
        {
          method: "POST",
          body: {
            lead_id: input.leadId,
            expert_profile_id: input.expertProfileId,
            direction: input.direction,
            channel: input.channel,
            telegram_message_id: input.telegramMessageId,
            text: truncateStoredText(input.text, MAX_STORED_MESSAGE_CHARS) ?? "",
            message_type: input.messageType,
          },
          prefer: "return=representation",
        },
      )
    ).data;
    await pruneSupabaseMessages(input.leadId);
    return rows[0];
  },
  async getStorageSummary() {
    const [profile, offers, faq, objections, leads, messages, materials] = await Promise.all([
      selectOne<Pick<ExpertProfileRow, "expert_name" | "gift_url">>("expert_profile", {
        select: "expert_name,gift_url",
        is_active: "eq.true",
        order: "updated_at.desc",
      }),
      countRows("expert_offers", { is_active: "eq.true" }),
      countRows("expert_faq", { is_active: "eq.true" }),
      countRows("expert_objections", { is_active: "eq.true" }),
      countRows("leads"),
      countRows("messages"),
      countRows("lead_materials"),
    ]);
    return {
      driver: "supabase" as const,
      mode: "supabase" as const,
      file: null,
      expert: profile?.expert_name ?? null,
      giftReady: isConfiguredUrl(profile?.gift_url),
      offers,
      faq,
      objections,
      leads,
      messages,
      materials,
    };
  },
  async getRuntimeSettings() {
    return globalWithSettings[settingsKey] ?? getDefaultRuntimeSettings();
  },
  async updateRuntimeSettings(input) {
    const next = { ...(globalWithSettings[settingsKey] ?? getDefaultRuntimeSettings()), ...input };
    globalWithSettings[settingsKey] = next;
    return next;
  },
  async getAdminOverview() {
    const now = Date.now();
    const dayAgo = new Date(now - 24 * 60 * 60 * 1_000).toISOString();
    const weekAgo = new Date(now - 7 * 24 * 60 * 60 * 1_000).toISOString();
    const [totalLeads, leadsToday, leadsWeek, qualified, converted, incomingMessages, outgoingMessages, ids] =
      await Promise.all([
        countRows("leads"),
        countRows("leads", { created_at: `gte.${dayAgo}` }),
        countRows("leads", { created_at: `gte.${weekAgo}` }),
        countRows("leads", { status: "in.(qualified,needs_manual_followup)" }),
        countRows("leads", {
          or: "(status.eq.needs_manual_followup,current_stage.ilike.*booked*,current_stage.ilike.*confirmed*,current_stage.ilike.*handoff*)",
        }),
        countRows("messages", { direction: "eq.incoming" }),
        countRows("messages", { direction: "eq.outgoing" }),
        selectRows<{ lead_id: string }>("messages", { select: "lead_id", limit: 5_000 }),
      ]);
    return {
      totalLeads,
      leadsToday,
      leadsWeek,
      qualified,
      converted,
      qualificationRate: totalLeads ? Math.round((qualified / totalLeads) * 100) : 0,
      conversionRate: totalLeads ? Math.round((converted / totalLeads) * 100) : 0,
      dialogues: new Set(ids.map((row) => row.lead_id)).size,
      incomingMessages,
      outgoingMessages,
    };
  },
  getAdminLeads: getSupabaseAdminLeads,
  async getRecentLeadDialogues(limit = 8) {
    return (await getSupabaseAdminLeads()).filter((lead) => lead.messageCount > 0).slice(0, limit);
  },
  async getLeadDialogue(leadId, limit = MAX_MESSAGE_HISTORY) {
    const [lead, newestFirst] = await Promise.all([
      this.getLeadById(leadId),
      this.getRecentMessagesByLeadId(leadId, Math.min(limit, MAX_MESSAGE_HISTORY)),
    ]);
    return { lead, messages: newestFirst.reverse() };
  },
  getActiveLibraryMaterials(category) {
    return selectRows<LibraryMaterialRow>("library_materials", {
      select: LIBRARY_MATERIAL_COLUMNS,
      is_active: "eq.true",
      ...(category ? { category: `eq.${category}` } : {}),
      order: "position.asc,created_at.asc",
      limit: 500,
    });
  },
  getLibraryMaterialById(materialId) {
    return selectOne<LibraryMaterialRow>("library_materials", {
      select: LIBRARY_MATERIAL_COLUMNS,
      id: `eq.${materialId}`,
    });
  },
  getActiveLibraryMaterialBySlug(category, slug) {
    return selectOne<LibraryMaterialRow>("library_materials", {
      select: LIBRARY_MATERIAL_COLUMNS,
      category: `eq.${category}`,
      slug: `eq.${slug}`,
      is_active: "eq.true",
    });
  },
  getLibraryProgress(userId, materialIds) {
    if (!materialIds.length) return Promise.resolve([]);
    return selectRows<LibraryProgressRow>("library_progress", {
      select: LIBRARY_PROGRESS_COLUMNS,
      user_id: `eq.${userId}`,
      material_id: `in.(${materialIds.join(",")})`,
      limit: Math.min(materialIds.length, 500),
    });
  },
  async upsertLibraryProgress(userId, materialId, status: LibraryProgressStatus) {
    const [existing] = await this.getLibraryProgress(userId, [materialId]);
    const rank: Record<LibraryProgressStatus, number> = { not_started: 0, opened: 1, completed: 2 };

    if (existing && rank[existing.status] >= rank[status]) return existing;

    const rows = (
      await supabaseRequest<LibraryProgressRow[]>(
        "library_progress",
        { on_conflict: "user_id,material_id", select: LIBRARY_PROGRESS_COLUMNS },
        {
          method: "POST",
          body: { user_id: userId, material_id: materialId, status },
          prefer: "resolution=merge-duplicates,return=representation",
        },
      )
    ).data;
    return rows[0];
  },
  async insertUserEvent(input: UserEventInsertInput) {
    const rows = (
      await supabaseRequest<{ id: string }[]>(
        "user_events",
        { select: "id" },
        {
          method: "POST",
          body: {
            user_id: input.userId,
            event_name: input.eventName,
            material_id: input.materialId ?? null,
            category: input.category ?? null,
            metadata: input.metadata ?? {},
          },
          prefer: "return=representation",
        },
      )
    ).data;
    return rows[0];
  },
  async hasUserEvent(userId, eventName, category) {
    return (
      (await countRows("user_events", {
        user_id: `eq.${userId}`,
        event_name: `eq.${eventName}`,
        ...(category === undefined ? {} : { category: category === null ? "is.null" : `eq.${category}` }),
      })) > 0
    );
  },
};
