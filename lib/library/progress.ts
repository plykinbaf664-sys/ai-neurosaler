import "server-only";

import { getLibraryProgress, upsertLibraryProgress, type LibraryMaterialRow } from "@/lib/storage";
import { cancelLibraryFollowup, scheduleLibraryFollowup } from "@/lib/library/followups";
import { getCategoryMaterials } from "@/lib/library/materials";
import { refreshLibraryUserProfile } from "@/lib/library/user-profile";
import { trackUserEvent } from "@/lib/tracking/events";

export type CategoryProgress = {
  category: string;
  completed: number;
  total: number;
  opened: number;
  rewardUnlocked: boolean;
  statuses: Map<string, "not_started" | "opened" | "completed">;
  materials: LibraryMaterialRow[];
};

export async function getCategoryProgress(userId: string, category: string): Promise<CategoryProgress> {
  const materials = await getCategoryMaterials(category);
  const progress = await getLibraryProgress(
    userId,
    materials.map((material) => material.id),
  );
  const statuses = new Map(progress.map((item) => [item.material_id, item.status]));
  const completed = progress.filter((item) => item.status === "completed").length;

  return {
    category,
    completed,
    total: materials.length,
    opened: progress.filter((item) => item.status === "opened").length,
    rewardUnlocked: materials.length > 0 && completed === materials.length,
    statuses,
    materials,
  };
}

export async function markMaterialOpened(userId: string, material: LibraryMaterialRow) {
  const [current] = await getLibraryProgress(userId, [material.id]);
  await upsertLibraryProgress(userId, material.id, "opened");
  await trackUserEvent({
    userId,
    eventName: "material_opened",
    materialId: material.id,
    category: material.category,
    metadata: {
      topic: material.topic,
      slug: material.slug,
      title: material.title,
      route: material.category,
      status: current?.status === "completed" ? "completed" : "opened",
      first_open: !current,
    },
  });
  await refreshLibraryUserProfile(userId);
  if (current?.status !== "completed") await scheduleLibraryFollowup(userId, material);
}

export async function markMaterialCompleted(userId: string, material: LibraryMaterialRow) {
  const [current] = await getLibraryProgress(userId, [material.id]);

  if (current?.status !== "completed") {
    await upsertLibraryProgress(userId, material.id, "completed");
    await trackUserEvent({
      userId,
      eventName: "material_completed",
      materialId: material.id,
      category: material.category,
      metadata: {
        topic: material.topic,
        slug: material.slug,
        title: material.title,
        route: material.category,
        status: "completed",
      },
    });
  }

  await refreshLibraryUserProfile(userId);
  await cancelLibraryFollowup(userId);

  return getCategoryProgress(userId, material.category);
}
