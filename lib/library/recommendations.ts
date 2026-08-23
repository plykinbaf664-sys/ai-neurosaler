import "server-only";

import { getCategoryProgress } from "@/lib/library/progress";

export async function getNextRecommendedMaterial(userId: string, category: string) {
  const progress = await getCategoryProgress(userId, category);
  return progress.materials.find((material) => progress.statuses.get(material.id) !== "completed") ?? null;
}
