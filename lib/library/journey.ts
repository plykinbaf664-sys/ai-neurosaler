import "server-only";
import { getActiveLibraryMaterials, getLibraryProgress, getUserLibraryProfile, getUserRewards, grantUserReward } from "@/lib/storage";
import { createLibraryToken } from "@/lib/security/library-token";

export async function getJourneyDashboard(userId: string, publicBaseUrl: string) {
  const [materials, profile, rewards] = await Promise.all([getActiveLibraryMaterials(), getUserLibraryProfile(userId), getUserRewards(userId)]);
  const progress = await getLibraryProgress(userId, materials.map((material) => material.id));
  const completedIds = new Set(progress.filter((item) => item.status === "completed").map((item) => item.material_id));
  const completed = completedIds.size;
  const days = profile?.active_days ?? 0;
  const categoryCompleted = (category: string) => {
    const group = materials.filter((material) => material.category === category);
    return group.length > 0 && group.every((material) => completedIds.has(material.id));
  };
  const definitions = [
    { key: "first_step", title: "Первый шаг", description: "Изучить первый материал", symbol: "✦", target: 1, current: completed },
    { key: "explorer", title: "Исследователь", description: "Изучить 3 материала", symbol: "◎", target: 3, current: completed },
    { key: "life", title: "Ясность", description: "Пройти все материалы AI для жизни", symbol: "☀", target: 1, current: Number(categoryCompleted("life")) },
    { key: "business", title: "Системный подход", description: "Пройти все материалы AI для бизнеса", symbol: "◇", target: 1, current: Number(categoryCompleted("business")) },
    { key: "active_3", title: "В ритме", description: "Быть активным в 3 разных дня", symbol: "≈", target: 3, current: days },
    { key: "active_7", title: "Добрая привычка", description: "Быть активным в 7 разных дней", symbol: "✺", target: 7, current: days },
    { key: "active_30", title: "На своей орбите", description: "Быть активным в 30 разных дней", symbol: "◉", target: 30, current: days },
  ];
  const earned = new Map(rewards.map((reward) => [reward.category, reward.created_at]));
  for (const reward of definitions) {
    if (!earned.has(reward.key) && reward.current >= reward.target) {
      await grantUserReward(userId, reward.key, { title: reward.title });
      earned.set(reward.key, new Date().toISOString());
    }
  }
  const preferred = profile?.recommended_material_ids ?? [];
  const selected = preferred.length ? preferred.flatMap((id) => {
    const material = materials.find((item) => item.id === id);
    return material ? [material] : [];
  }) : materials.filter((material) => !completedIds.has(material.id) && material.category === profile?.last_category).slice(0, 3);
  const track = selected.map((material) => {
    const url = new URL("/api/library/open", publicBaseUrl);
    url.searchParams.set("token", createLibraryToken({ userId, materialId: material.id, category: material.category, slug: material.slug }, 30 * 86400));
    return { id: material.id, title: material.title, description: material.short_description, completed: completedIds.has(material.id), url: url.toString() };
  });
  return { goal: profile?.journey_goal ?? null, completed, total: materials.length, activeDays: days,
    remindersEnabled: profile?.reminders_enabled !== false, track,
    rewards: definitions.map((reward) => ({ ...reward, current: Math.min(reward.current, reward.target), unlocked: earned.has(reward.key), earnedAt: earned.get(reward.key) ?? null })) };
}

export type JourneyDashboard = Awaited<ReturnType<typeof getJourneyDashboard>>;
