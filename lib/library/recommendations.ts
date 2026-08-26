import "server-only";

import { getCategoryProgress } from "@/lib/library/progress";
import type { LibraryMaterialRow } from "@/lib/storage";

export async function getNextRecommendedMaterial(userId: string, category: string) {
  const progress = await getCategoryProgress(userId, category);
  return progress.materials.find((material) => progress.statuses.get(material.id) !== "completed") ?? null;
}

export async function getNextMaterialAfter(userId: string, currentMaterial: LibraryMaterialRow) {
  const progress = await getCategoryProgress(userId, currentMaterial.category);
  const currentIndex = progress.materials.findIndex((material) => material.id === currentMaterial.id);

  if (currentIndex < 0) return null;
  return (
    progress.materials
      .slice(currentIndex + 1)
      .find((material) => progress.statuses.get(material.id) !== "completed") ?? null
  );
}
