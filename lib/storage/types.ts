export type LeadRow = {
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

export type ExpertProfileRow = {
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

export type ExpertOfferRow = {
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

export type ExpertFaqRow = {
  id: string;
  expert_profile_id: string;
  question: string;
  answer: string;
  sort_order: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type ExpertObjectionRow = {
  id: string;
  expert_profile_id: string;
  objection: string;
  response: string;
  sort_order: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type MessageRow = {
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

export type LeadMaterialRow = {
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

export type LeadUpsertInput = {
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

export type LeadMaterialInsertInput = {
  leadId: string;
  materialType: "pdf" | "url" | "text" | "unknown";
  sourceUrl?: string | null;
  telegramFileId?: string | null;
  fileName?: string | null;
  rawText?: string | null;
  analysis?: string | null;
  status?: "received" | "analyzed" | "failed";
};

export type MessageInsertInput = {
  leadId: string;
  expertProfileId: string | null;
  direction: "incoming" | "outgoing";
  channel: "telegram";
  telegramMessageId: number | null;
  text: string;
  messageType: MessageRow["message_type"];
};

export type RuntimeSettings = {
  entryFlowMode: "quiz" | "gift";
  giftFollowupsEnabled: boolean;
};

export type StorageSummary = {
  driver: "local" | "supabase";
  mode: "file" | "memory" | "supabase";
  file: string | null;
  expert: string | null;
  giftReady: boolean;
  offers: number;
  faq: number;
  objections: number;
  leads: number;
  messages: number;
  materials: number;
};

export type AdminOverview = {
  totalLeads: number;
  leadsToday: number;
  leadsWeek: number;
  qualified: number;
  converted: number;
  qualificationRate: number;
  conversionRate: number;
  dialogues: number;
  incomingMessages: number;
  outgoingMessages: number;
};

export type AdminLeadRow = LeadRow & { messageCount: number; lastMessageAt: string | null };
export type StoredRowRef = { id: string };

export interface StorageAdapter {
  getActiveExpertProfile(): Promise<ExpertProfileRow | null>;
  getActiveExpertOffers(expertProfileId: string): Promise<ExpertOfferRow[]>;
  getActiveExpertFaq(expertProfileId: string): Promise<ExpertFaqRow[]>;
  getActiveExpertObjections(expertProfileId: string): Promise<ExpertObjectionRow[]>;
  getLeadByTelegramUserId(telegramUserId: number): Promise<LeadRow | null>;
  getLeadById(leadId: string): Promise<LeadRow | null>;
  getDueGiftFollowupLeads(nowIso: string, limit?: number): Promise<LeadRow[]>;
  getRecentMessagesByLeadId(leadId: string, limit?: number): Promise<MessageRow[]>;
  getLeadMaterialsCount(leadId: string): Promise<number>;
  createLeadMaterial(input: LeadMaterialInsertInput): Promise<StoredRowRef>;
  updateLeadMaterialById(
    materialId: string,
    input: Partial<Pick<LeadMaterialInsertInput, "analysis" | "status" | "rawText">>,
  ): Promise<StoredRowRef | null>;
  createLead(input: LeadUpsertInput): Promise<LeadRow>;
  updateLeadById(leadId: string, input: Partial<LeadUpsertInput>): Promise<LeadRow | null>;
  insertMessage(input: MessageInsertInput): Promise<StoredRowRef>;
  getStorageSummary(): Promise<StorageSummary>;
  getRuntimeSettings(): Promise<RuntimeSettings>;
  updateRuntimeSettings(input: Partial<RuntimeSettings>): Promise<RuntimeSettings>;
  getAdminOverview(): Promise<AdminOverview>;
  getAdminLeads(): Promise<AdminLeadRow[]>;
  getRecentLeadDialogues(limit?: number): Promise<AdminLeadRow[]>;
  getLeadDialogue(leadId: string, limit?: number): Promise<{ lead: LeadRow | null; messages: MessageRow[] }>;
}
