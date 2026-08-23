import { connection } from "next/server";
import { notFound } from "next/navigation";

import { isLibraryEnabled } from "@/lib/library/config";
import { getMaterialBySlug } from "@/lib/library/materials";
import { getCategoryProgress } from "@/lib/library/progress";
import { getNextRecommendedMaterial } from "@/lib/library/recommendations";
import { createLibraryToken, verifyLibraryToken } from "@/lib/security/library-token";

export default async function MaterialPage({
  params,
  searchParams,
}: {
  params: Promise<{ category: string; slug: string }>;
  searchParams: Promise<{ token?: string; completed?: string }>;
}) {
  await connection();
  if (!isLibraryEnabled()) notFound();
  const { category, slug } = await params;
  const query = await searchParams;
  const material = await getMaterialBySlug(category, slug);
  if (!material) notFound();

  const token = query.token ?? "";
  const payload = verifyLibraryToken(token);
  const hasIdentity = Boolean(
    payload &&
      payload.materialId === material.id &&
      payload.category === material.category &&
      payload.slug === material.slug,
  );
  const progress = payload && hasIdentity ? await getCategoryProgress(payload.userId, category) : null;
  const currentStatus = progress?.statuses.get(material.id) ?? "not_started";
  const nextMaterial =
    payload && hasIdentity && currentStatus === "completed"
      ? await getNextRecommendedMaterial(payload.userId, category)
      : null;
  const nextToken =
    payload && nextMaterial
      ? createLibraryToken({
          userId: payload.userId,
          materialId: nextMaterial.id,
          category: nextMaterial.category,
          slug: nextMaterial.slug,
        })
      : null;

  return (
    <main className="min-h-screen bg-[#080b12] px-5 py-12 text-white">
      <article className="mx-auto max-w-3xl rounded-3xl border border-white/10 bg-white/[0.035] p-7 sm:p-10">
        <p className="text-sm uppercase tracking-[0.2em] text-violet-300">{material.category}</p>
        <h1 className="mt-3 text-4xl font-semibold">{material.title}</h1>
        <p className="mt-5 text-lg leading-8 text-slate-300">{material.short_description}</p>

        <section className="mt-8 rounded-2xl border border-violet-400/20 bg-violet-400/[0.06] p-6">
          <h2 className="text-lg font-medium">Материал готовится</h2>
          <p className="mt-2 leading-7 text-slate-400">
            Это foundation-страница библиотеки. Полный материал будет добавлен отдельно, без хранения больших
            статей в Telegram или Supabase.
          </p>
        </section>

        {progress ? (
          <section className="mt-8">
            <p className="text-slate-300">Изучено {progress.completed} из {progress.total}</p>
            {query.completed === "1" ? (
              <p className="mt-3 text-emerald-300">
                Материал отмечен завершённым.{progress.rewardUnlocked ? " Дополнительный бонус открыт." : ""}
              </p>
            ) : null}

            {currentStatus !== "completed" ? (
              <form action="/api/library/complete" method="post" className="mt-5">
                <input type="hidden" name="token" value={token} />
                <button className="rounded-xl bg-violet-500 px-5 py-3 font-medium hover:bg-violet-400" type="submit">
                  Отметить завершённым
                </button>
              </form>
            ) : nextMaterial && nextToken ? (
              <a
                className="mt-5 inline-flex rounded-xl bg-violet-500 px-5 py-3 font-medium hover:bg-violet-400"
                href={`/api/library/next?token=${encodeURIComponent(nextToken)}`}
              >
                Следующий материал: {nextMaterial.title}
              </a>
            ) : (
              <p className="mt-5 font-medium text-violet-200">Все активные материалы категории изучены.</p>
            )}
          </section>
        ) : (
          <p className="mt-8 rounded-xl border border-amber-300/20 bg-amber-300/[0.06] p-4 text-amber-100">
            Для сохранения прогресса открой материал по свежей ссылке из Telegram-бота.
          </p>
        )}
      </article>
    </main>
  );
}
