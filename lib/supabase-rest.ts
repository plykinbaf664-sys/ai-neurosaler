type SupabaseLeadRow = {
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

type SupabaseExpertProfileRow = {
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

type SupabaseExpertOfferRow = {
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

type SupabaseExpertFaqRow = {
  id: string;
  expert_profile_id: string;
  question: string;
  answer: string;
  sort_order: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

type SupabaseExpertObjectionRow = {
  id: string;
  expert_profile_id: string;
  objection: string;
  response: string;
  sort_order: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

type SupabaseMessageRow = {
  id: string;
  lead_id: string;
  expert_profile_id: string | null;
  direction: "incoming" | "outgoing";
  channel: "telegram";
  telegram_message_id: number | null;
  text: string;
  message_type: "user" | "welcome" | "gift" | "qual_question" | "gift_followup" | "ai_reply";
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

type MessageInsertInput = {
  leadId: string;
  expertProfileId: string | null;
  direction: "incoming" | "outgoing";
  channel: "telegram";
  telegramMessageId: number | null;
  text: string;
  messageType: "user" | "welcome" | "gift" | "qual_question" | "gift_followup" | "ai_reply";
};

function getSupabaseConfig() {
  const url = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.");
  }

  return { url, serviceRoleKey };
}

async function supabaseRequest<T>(path: string, init?: RequestInit) {
  const { url, serviceRoleKey } = getSupabaseConfig();
  const requestUrl = `${url}/rest/v1/${path}`;
  let response: Response;

  try {
    response = await fetch(requestUrl, {
      ...init,
      headers: {
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`,
        "Content-Type": "application/json",
        ...(init?.headers ?? {}),
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown fetch error.";
    const host = new URL(url).host;
    throw new Error(`Supabase fetch failed for ${host}. Check SUPABASE_URL in .env.local. Original error: ${message}`);
  }

  if (!response.ok) {
    throw new Error(`Supabase request failed: ${response.status} ${await response.text()}`);
  }

  if (response.status === 204) {
    return null as T;
  }

  const responseText = await response.text();

  if (!responseText.trim()) {
    return null as T;
  }

  return JSON.parse(responseText) as T;
}

export async function getActiveExpertProfile() {
  const rows = await supabaseRequest<SupabaseExpertProfileRow[]>(
    "expert_profile?select=*&is_active=eq.true&order=created_at.asc&limit=1",
  );

  return rows[0] ?? null;
}

export async function getActiveExpertOffers(expertProfileId: string) {
  return supabaseRequest<SupabaseExpertOfferRow[]>(
    `expert_offers?select=*&expert_profile_id=eq.${encodeURIComponent(expertProfileId)}&is_active=eq.true&order=created_at.asc`,
  );
}

export async function getActiveExpertFaq(expertProfileId: string) {
  return supabaseRequest<SupabaseExpertFaqRow[]>(
    `expert_faq?select=*&expert_profile_id=eq.${encodeURIComponent(expertProfileId)}&is_active=eq.true&order=sort_order.asc,created_at.asc`,
  );
}

export async function getActiveExpertObjections(expertProfileId: string) {
  return supabaseRequest<SupabaseExpertObjectionRow[]>(
    `expert_objections?select=*&expert_profile_id=eq.${encodeURIComponent(expertProfileId)}&is_active=eq.true&order=sort_order.asc,created_at.asc`,
  );
}

export async function getLeadByTelegramUserId(telegramUserId: number) {
  const rows = await supabaseRequest<SupabaseLeadRow[]>(
    `leads?select=*&telegram_user_id=eq.${telegramUserId}&limit=1`,
  );

  return rows[0] ?? null;
}

export async function getLeadById(leadId: string) {
  const rows = await supabaseRequest<SupabaseLeadRow[]>(
    `leads?select=*&id=eq.${encodeURIComponent(leadId)}&limit=1`,
  );

  return rows[0] ?? null;
}

export async function getDueGiftFollowupLeads(nowIso: string, limit = 20) {
  return supabaseRequest<SupabaseLeadRow[]>(
    `leads?select=*&gift_followup_due_at=lte.${encodeURIComponent(nowIso)}&gift_link_clicked_at=is.null&gift_followup_sent_at=is.null&order=gift_followup_due_at.asc&limit=${limit}`,
  );
}

export async function getRecentMessagesByLeadId(leadId: string, limit = 10) {
  return supabaseRequest<SupabaseMessageRow[]>(
    `messages?select=*&lead_id=eq.${encodeURIComponent(leadId)}&order=created_at.desc&limit=${limit}`,
  );
}

export async function createLead(input: LeadUpsertInput) {
  const rows = await supabaseRequest<SupabaseLeadRow[]>("leads", {
    method: "POST",
    headers: {
      Prefer: "return=representation",
    },
    body: JSON.stringify([
      {
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
      },
    ]),
  });

  return rows[0];
}

export async function updateLeadById(leadId: string, input: Partial<LeadUpsertInput>) {
  const payload: Record<string, string | number | null> = {};

  if (input.expertProfileId !== undefined) {
    payload.expert_profile_id = input.expertProfileId;
  }
  if (input.telegramChatId !== undefined) {
    payload.telegram_chat_id = input.telegramChatId;
  }
  if (input.telegramUsername !== undefined) {
    payload.telegram_username = input.telegramUsername;
  }
  if (input.firstName !== undefined) {
    payload.first_name = input.firstName;
  }
  if (input.lastName !== undefined) {
    payload.last_name = input.lastName;
  }
  if (input.source !== undefined) {
    payload.source = input.source;
  }
  if (input.status !== undefined) {
    payload.status = input.status;
  }
  if (input.currentStage !== undefined) {
    payload.current_stage = input.currentStage;
  }
  if (input.matchedOffer !== undefined) {
    payload.matched_offer = input.matchedOffer;
  }
  if (input.lastUserMessage !== undefined) {
    payload.last_user_message = input.lastUserMessage;
  }
  if (input.warmthLevel !== undefined) {
    payload.warmth_level = input.warmthLevel;
  }
  if (input.giftLinkClickedAt !== undefined) {
    payload.gift_link_clicked_at = input.giftLinkClickedAt;
  }
  if (input.giftFollowupDueAt !== undefined) {
    payload.gift_followup_due_at = input.giftFollowupDueAt;
  }
  if (input.giftFollowupSentAt !== undefined) {
    payload.gift_followup_sent_at = input.giftFollowupSentAt;
  }

  const rows = await supabaseRequest<SupabaseLeadRow[]>(`leads?id=eq.${encodeURIComponent(leadId)}`, {
    method: "PATCH",
    headers: {
      Prefer: "return=representation",
    },
    body: JSON.stringify(payload),
  });

  return rows[0] ?? null;
}

export async function insertMessage(input: MessageInsertInput) {
  await supabaseRequest<null>("messages", {
    method: "POST",
    headers: {
      Prefer: "return=minimal",
    },
    body: JSON.stringify([
      {
        lead_id: input.leadId,
        expert_profile_id: input.expertProfileId,
        direction: input.direction,
        channel: input.channel,
        telegram_message_id: input.telegramMessageId,
        text: input.text,
        message_type: input.messageType,
      },
    ]),
  });
}

export type {
  SupabaseExpertFaqRow,
  SupabaseExpertObjectionRow,
  SupabaseExpertOfferRow,
  SupabaseExpertProfileRow,
  SupabaseLeadRow,
  SupabaseMessageRow,
};
