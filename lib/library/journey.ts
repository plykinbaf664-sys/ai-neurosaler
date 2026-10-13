import "server-only";
import { getUserRewards, grantUserReward } from "@/lib/storage";
import { getLibraryJourneyState, getJourneyTrack, selectNextMaterial } from "@/lib/library/recommendations";
import { createLibraryToken } from "@/lib/security/library-token";

export async function getJourneyDashboard(userId: string, publicBaseUrl: string) {
  const [state, rewards] = await Promise.all([getLibraryJourneyState(userId), getUserRewards(userId)]);
  const { materials, profile } = state;
  const completedIds = new Set(materials.filter((item) => state.statuses.get(item.id) === "completed").map((item) => item.id));
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
  const selected = getJourneyTrack(state);
  const next = selectNextMaterial(state);
  const track = selected.map((material) => {
    const url = new URL("/api/library/open", publicBaseUrl);
    url.searchParams.set("token", createLibraryToken({ userId, materialId: material.id, category: material.category, slug: material.slug }, 30 * 86400));
    return { id: material.id, title: material.title, description: material.short_description, guidance: material.guidance ?? null,
      feedback: profile?.material_feedback?.[material.id] ?? null, isNext: next?.id === material.id,
      completed: completedIds.has(material.id), url: url.toString() };
  });
  return { goal: profile?.journey_goal ?? null, completed, total: materials.length, activeDays: days,
    remindersEnabled: profile?.reminders_enabled !== false, nextMaterialId: next?.id ?? null,
    routeFinished: selected.length > 0 && !next, track,
    rewards: definitions.map((reward) => ({ ...reward, current: Math.min(reward.current, reward.target), unlocked: earned.has(reward.key), earnedAt: earned.get(reward.key) ?? null })) };
}

export type JourneyDashboard = Awaited<ReturnType<typeof getJourneyDashboard>>;
