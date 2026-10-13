import "server-only";

import { grantUserReward } from "@/lib/storage";
import type { CategoryProgress } from "@/lib/library/progress";

export async function unlockCategoryReward(userId: string, progress: CategoryProgress) {
  if (!progress.rewardUnlocked) return false;

  await grantUserReward(userId, progress.category, { completed_count: progress.completed });
  return true;
}
