import "server-only";

import { hasUserEvent } from "@/lib/storage";
import type { CategoryProgress } from "@/lib/library/progress";
import { trackUserEvent } from "@/lib/tracking/events";

export async function unlockCategoryReward(userId: string, progress: CategoryProgress) {
  if (!progress.rewardUnlocked) return false;

  if (await hasUserEvent(userId, "reward_unlocked", progress.category)) return true;

  await trackUserEvent({
    userId,
    eventName: "reward_unlocked",
    category: progress.category,
    metadata: { completed_count: progress.completed },
  });
  return true;
}
