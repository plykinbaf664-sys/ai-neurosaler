import "server-only";

import * as localStore from "@/lib/data-store";
import {
  MAX_MATERIALS_PER_LEAD,
  MAX_MATERIAL_TEXT_CHARS,
  MAX_MESSAGE_HISTORY,
  MAX_STORED_MESSAGE_CHARS,
  truncateStoredText,
} from "@/lib/storage/limits";
import type { LeadMaterialInsertInput, MessageInsertInput, StorageAdapter } from "@/lib/storage/types";

function sanitizeMaterial(input: LeadMaterialInsertInput): LeadMaterialInsertInput {
  return {
    ...input,
    sourceUrl: truncateStoredText(input.sourceUrl, 2_048),
    telegramFileId: truncateStoredText(input.telegramFileId, 512),
    fileName: truncateStoredText(input.fileName, 255),
    rawText: truncateStoredText(input.rawText, MAX_MATERIAL_TEXT_CHARS),
    analysis: truncateStoredText(input.analysis, MAX_MATERIAL_TEXT_CHARS),
  };
}

export const localStorageAdapter: StorageAdapter = {
  getActiveExpertProfile: localStore.getActiveExpertProfile,
  getActiveExpertOffers: localStore.getActiveExpertOffers,
  getActiveExpertFaq: localStore.getActiveExpertFaq,
  getActiveExpertObjections: localStore.getActiveExpertObjections,
  getLeadByTelegramUserId: localStore.getLeadByTelegramUserId,
  getLeadById: localStore.getLeadById,
  getDueGiftFollowupLeads: localStore.getDueGiftFollowupLeads,
  getRecentMessagesByLeadId(leadId, limit = MAX_MESSAGE_HISTORY) {
    return localStore.getRecentMessagesByLeadId(leadId, Math.min(limit, MAX_MESSAGE_HISTORY));
  },
  getLeadMaterialsCount: localStore.getLeadMaterialsCount,
  async createLeadMaterial(input) {
    if ((await localStore.getLeadMaterialsCount(input.leadId)) >= MAX_MATERIALS_PER_LEAD) {
      throw new Error(`Lead material limit (${MAX_MATERIALS_PER_LEAD}) reached.`);
    }

    return localStore.createLeadMaterial(sanitizeMaterial(input));
  },
  updateLeadMaterialById(materialId, input) {
    return localStore.updateLeadMaterialById(materialId, {
      ...input,
      rawText:
        input.rawText === undefined ? undefined : truncateStoredText(input.rawText, MAX_MATERIAL_TEXT_CHARS),
      analysis:
        input.analysis === undefined ? undefined : truncateStoredText(input.analysis, MAX_MATERIAL_TEXT_CHARS),
    });
  },
  createLead: localStore.createLead,
  updateLeadById: localStore.updateLeadById,
  async insertMessage(input: MessageInsertInput) {
    const message = await localStore.insertMessage({
      ...input,
      text: truncateStoredText(input.text, MAX_STORED_MESSAGE_CHARS) ?? "",
    });
    await localStore.pruneMessagesByLeadId(input.leadId, MAX_MESSAGE_HISTORY);
    return message;
  },
  async getStorageSummary() {
    const summary = await localStore.getLocalStoreSummary();
    return {
      ...summary,
      driver: "local" as const,
      mode: summary.mode === "memory" ? ("memory" as const) : ("file" as const),
    };
  },
  getRuntimeSettings: localStore.getRuntimeSettings,
  updateRuntimeSettings: localStore.updateRuntimeSettings,
  getAdminOverview: localStore.getAdminOverview,
  getAdminLeads: localStore.getAdminLeads,
  getRecentLeadDialogues: localStore.getRecentLeadDialogues,
  getLeadDialogue(leadId, limit = MAX_MESSAGE_HISTORY) {
    return localStore.getLeadDialogue(leadId, Math.min(limit, MAX_MESSAGE_HISTORY));
  },
};
