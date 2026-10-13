import "server-only";

import { getCategoryProgress, type CategoryProgress } from "@/lib/library/progress";
import { getActiveLibraryMaterials, getLibraryProgress, getUserLibraryProfile, type LibraryMaterialRow } from "@/lib/storage";
export { buildContextualLibraryReply } from "@/lib/library/dialogue";

export async function getNextRecommendedMaterial(userId: string, category: string) {
  const [progress, profile] = await Promise.all([getCategoryProgress(userId, category), getUserLibraryProfile(userId)]);
  const preferred = (profile?.recommended_material_ids ?? []).map((id) => progress.materials.find((material) => material.id === id)).find((material) => material && progress.statuses.get(material.id) !== "completed");
  if (preferred) return preferred;
  return progress.materials.find((material) => progress.statuses.get(material.id) !== "completed") ?? null;
}

export async function getNextMaterialAfter(userId: string, currentMaterial: LibraryMaterialRow, currentProgress?: CategoryProgress) {
  const profile = await getUserLibraryProfile(userId);
  const ids = profile?.recommended_material_ids ?? [];
  const trackIndex = ids.indexOf(currentMaterial.id);
  if (trackIndex >= 0) {
    const nextIds = ids.slice(trackIndex + 1);
    const [materials, statuses] = await Promise.all([getActiveLibraryMaterials(), getLibraryProgress(userId, nextIds)]);
    const completed = new Set(statuses.filter((item) => item.status === "completed").map((item) => item.material_id));
    return nextIds.flatMap((id) => materials.filter((material) => material.id === id && !completed.has(id)))[0] ?? null;
  }
  const progress = currentProgress ?? await getCategoryProgress(userId, currentMaterial.category);
  const currentIndex = progress.materials.findIndex((material) => material.id === currentMaterial.id);

  if (currentIndex < 0) return null;
  return (
    progress.materials
      .slice(currentIndex + 1)
      .find((material) => progress.statuses.get(material.id) !== "completed") ?? null
  );
}
