import { connection } from "next/server";

import { getLibraryCategoryLabel, isLibraryEnabled } from "@/lib/library/config";
import { getActiveLibraryMaterials } from "@/lib/storage";

export default async function LibraryPage() {
  await connection();
  const materials = isLibraryEnabled() ? await getActiveLibraryMaterials() : [];
  const categoryCounts = new Map<string, number>();
  for (const material of materials) {
    categoryCounts.set(material.category, (categoryCounts.get(material.category) ?? 0) + 1);
  }

  return (
    <main className="min-h-screen bg-[#080b12] px-5 py-12 text-white">
      <div className="mx-auto max-w-3xl">
        <p className="text-sm uppercase tracking-[0.2em] text-violet-300">Neiroclozer Library</p>
        <h1 className="mt-3 text-4xl font-semibold">Библиотека AI-материалов</h1>
        <p className="mt-4 text-slate-400">
          Выбери направление в Telegram-боте: персональный прогресс и завершение материалов доступны по
          защищённой ссылке из чата.
        </p>
        <div className="mt-8 grid gap-4 sm:grid-cols-2">
          {[...categoryCounts.entries()].map(([category, count]) => (
            <article key={category} className="rounded-2xl border border-white/10 bg-white/[0.04] p-6">
              <h2 className="text-xl font-medium">{getLibraryCategoryLabel(category)}</h2>
              <p className="mt-2 text-sm text-slate-400">Активных материалов: {count}</p>
            </article>
          ))}
        </div>
      </div>
    </main>
  );
}
