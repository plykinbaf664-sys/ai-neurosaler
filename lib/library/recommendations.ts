import "server-only";

import type { CategoryProgress } from "@/lib/library/progress";
import { getActiveLibraryMaterials, getLibraryProgress, getUserLibraryProfile, type LibraryMaterialRow, type UserLibraryProfileRow } from "@/lib/storage";

export type JourneyState = { materials: LibraryMaterialRow[]; profile: UserLibraryProfileRow | null; statuses: Map<string, string> };

export async function getLibraryJourneyState(userId: string, profile?: UserLibraryProfileRow | null): Promise<JourneyState> {
  const [materials, savedProfile] = await Promise.all([getActiveLibraryMaterials(), profile === undefined ? getUserLibraryProfile(userId) : profile]);
  const progress = await getLibraryProgress(userId, materials.map((material) => material.id));
  return { materials, profile: savedProfile, statuses: new Map(progress.map((item) => [item.material_id, item.status])) };
}

export function getJourneyTrack(state: JourneyState, category?: string) {
  const eligible = state.materials.filter((material) => material.is_active && state.profile?.material_feedback?.[material.id] !== "not_relevant");
  const ids = state.profile?.recommended_material_ids ?? [];
  if (ids.length) return ids.flatMap((id) => eligible.filter((material) => material.id === id && (!category || material.category === category)));
  // An empty saved goal route means no matching solution, not a random catalogue fallback.
  if (state.profile?.journey_goal) return [];
  const direction = category ?? state.profile?.last_category;
  return eligible.filter((material) => material.category === direction && state.statuses.get(material.id) !== "completed").slice(0, 3);
}

export function selectNextMaterial(state: JourneyState, options: { category?: string; excludeId?: string } = {}) {
  return getJourneyTrack(state, options.category).find((material) => material.id !== options.excludeId && state.statuses.get(material.id) !== "completed") ?? null;
}

export async function getNextRecommendedMaterial(userId: string, category?: string) {
  return selectNextMaterial(await getLibraryJourneyState(userId), { category });
}

export async function getNextMaterialAfter(userId: string, currentMaterial: LibraryMaterialRow, currentProgress?: CategoryProgress) {
  const profile = await getUserLibraryProfile(userId);
  const hasTrack = Boolean(profile?.recommended_material_ids?.length || profile?.journey_goal);
  const state = currentProgress && !hasTrack
    ? { materials: currentProgress.materials, statuses: currentProgress.statuses, profile }
    : await getLibraryJourneyState(userId, profile);
  return selectNextMaterial(state, { excludeId: currentMaterial.id, category: hasTrack ? undefined : currentMaterial.category });
}
