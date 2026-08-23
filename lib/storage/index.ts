import "server-only";

import { localStorageAdapter } from "@/lib/storage/local";
import { supabaseStorageAdapter } from "@/lib/storage/supabase";
import type {
  LeadMaterialInsertInput,
  LeadUpsertInput,
  MessageInsertInput,
  RuntimeSettings,
  StorageAdapter,
} from "@/lib/storage/types";

function getStorageAdapter(): StorageAdapter {
  const driver = process.env.STORAGE_DRIVER?.trim().toLowerCase() || "local";

  if (driver === "local") return localStorageAdapter;
  if (driver === "supabase") return supabaseStorageAdapter;
  throw new Error(`Unsupported STORAGE_DRIVER: ${driver}. Use local or supabase.`);
}

export function getActiveExpertProfile() {
  return getStorageAdapter().getActiveExpertProfile();
}

export function getActiveExpertOffers(expertProfileId: string) {
  return getStorageAdapter().getActiveExpertOffers(expertProfileId);
}

export function getActiveExpertFaq(expertProfileId: string) {
  return getStorageAdapter().getActiveExpertFaq(expertProfileId);
}

export function getActiveExpertObjections(expertProfileId: string) {
  return getStorageAdapter().getActiveExpertObjections(expertProfileId);
}

export function getLeadByTelegramUserId(telegramUserId: number) {
  return getStorageAdapter().getLeadByTelegramUserId(telegramUserId);
}

export function getLeadById(leadId: string) {
  return getStorageAdapter().getLeadById(leadId);
}

export function getDueGiftFollowupLeads(nowIso: string, limit?: number) {
  return getStorageAdapter().getDueGiftFollowupLeads(nowIso, limit);
}

export function getRecentMessagesByLeadId(leadId: string, limit?: number) {
  return getStorageAdapter().getRecentMessagesByLeadId(leadId, limit);
}

export function getLeadMaterialsCount(leadId: string) {
  return getStorageAdapter().getLeadMaterialsCount(leadId);
}

export function createLeadMaterial(input: LeadMaterialInsertInput) {
  return getStorageAdapter().createLeadMaterial(input);
}

export function updateLeadMaterialById(
  materialId: string,
  input: Partial<Pick<LeadMaterialInsertInput, "analysis" | "status" | "rawText">>,
) {
  return getStorageAdapter().updateLeadMaterialById(materialId, input);
}

export function createLead(input: LeadUpsertInput) {
  return getStorageAdapter().createLead(input);
}

export function updateLeadById(leadId: string, input: Partial<LeadUpsertInput>) {
  return getStorageAdapter().updateLeadById(leadId, input);
}

export function insertMessage(input: MessageInsertInput) {
  return getStorageAdapter().insertMessage(input);
}

export function getStorageSummary() {
  return getStorageAdapter().getStorageSummary();
}

export const getLocalStoreSummary = getStorageSummary;

export function getRuntimeSettings() {
  return getStorageAdapter().getRuntimeSettings();
}

export function updateRuntimeSettings(input: Partial<RuntimeSettings>) {
  return getStorageAdapter().updateRuntimeSettings(input);
}

export function getAdminOverview() {
  return getStorageAdapter().getAdminOverview();
}

export function getAdminLeads() {
  return getStorageAdapter().getAdminLeads();
}

export function getRecentLeadDialogues(limit?: number) {
  return getStorageAdapter().getRecentLeadDialogues(limit);
}

export function getLeadDialogue(leadId: string, limit?: number) {
  return getStorageAdapter().getLeadDialogue(leadId, limit);
}

export type {
  AdminLeadRow,
  AdminOverview,
  ExpertFaqRow,
  ExpertObjectionRow,
  ExpertOfferRow,
  ExpertProfileRow,
  LeadMaterialInsertInput,
  LeadMaterialRow,
  LeadRow,
  LeadUpsertInput,
  MessageInsertInput,
  MessageRow,
  RuntimeSettings,
  StorageAdapter,
  StorageSummary,
  StoredRowRef,
} from "@/lib/storage/types";
