import { connection } from "next/server";

import { getLocalStoreSummary } from "@/lib/storage";

function StatusBadge({ ready, children }: { ready: boolean; children: React.ReactNode }) {
  return (
    <span
      className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-medium ${
        ready ? "bg-emerald-400/10 text-emerald-300" : "bg-amber-400/10 text-amber-200"
      }`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${ready ? "bg-emerald-400" : "bg-amber-300"}`} />
      {children}
    </span>
  );
}

export default async function Home() {
  await connection();
  const store = await getLocalStoreSummary();
  const telegramReady = Boolean(process.env.TELEGRAM_BOT_TOKEN);
  const adminReady = Boolean(process.env.TELEGRAM_ADMIN_USER_ID);
  const aiReady = Boolean(process.env.ANTHROPIC_API_KEY);
  const systemReady = Boolean(store.expert) && store.giftReady && telegramReady && adminReady && aiReady;

  const stats = [
    ["Офферы", store.offers],
    ["FAQ", store.faq],
    ["Возражения", store.objections],
    ["Лиды", store.leads],
    ["Сообщения", store.messages],
    ["Материалы", store.materials],
  ] as const;

  return (
    <main className="min-h-screen bg-[#080b12] px-5 py-8 text-white sm:px-8 lg:px-12">
      <div className="mx-auto flex max-w-6xl flex-col gap-8">
        <header className="flex flex-col gap-5 border-b border-white/10 pb-8 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="mb-3 text-xs font-semibold uppercase tracking-[0.28em] text-violet-300">
              NeuroSeller · demo runtime
            </p>
            <h1 className="max-w-3xl text-4xl font-semibold tracking-tight sm:text-5xl">
              Нейропродавец работает автономно
            </h1>
            <p className="mt-4 max-w-2xl text-base leading-7 text-slate-400">
              Единый слой хранения подключён. Квиз, история диалогов, материалы, статусы лидов и
              follow-up работают с выбранным storage-драйвером.
            </p>
          </div>
          <StatusBadge ready={systemReady}>{systemReady ? "Система готова" : "Нужна настройка"}</StatusBadge>
        </header>

        <section className="grid gap-4 md:grid-cols-3">
          <article className="rounded-2xl border border-violet-400/20 bg-violet-400/[0.07] p-6">
            <p className="text-sm text-violet-200">Хранилище</p>
            <p className="mt-3 text-2xl font-semibold">
              {store.mode === "supabase" ? "Supabase" : store.mode === "file" ? "Локальный JSON" : "Память"}
            </p>
            <p className="mt-2 text-sm leading-6 text-slate-400">
              {store.mode === "memory" ? "Данные живут до перезапуска процесса." : "Данные сохраняются между перезапусками."}
            </p>
          </article>
          <article className="rounded-2xl border border-white/10 bg-white/[0.035] p-6">
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm text-slate-300">Telegram</p>
              <StatusBadge ready={telegramReady}>{telegramReady ? "подключён" : "нужен токен"}</StatusBadge>
            </div>
            <p className="mt-4 text-2xl font-semibold">Webhook</p>
            <p className="mt-2 text-sm leading-6 text-slate-400">Принимает сообщения, кнопки и PDF-материалы.</p>
          </article>
          <article className="rounded-2xl border border-white/10 bg-white/[0.035] p-6">
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm text-slate-300">AI-ответы</p>
              <StatusBadge ready={aiReady}>{aiReady ? "подключены" : "нужен ключ"}</StatusBadge>
            </div>
            <p className="mt-4 text-2xl font-semibold">Anthropic</p>
            <p className="mt-2 text-sm leading-6 text-slate-400">Используется после квиза и для анализа материалов.</p>
          </article>
        </section>

        {!store.giftReady ? (
          <section className="rounded-2xl border border-amber-300/20 bg-amber-300/[0.06] px-5 py-4 text-sm leading-6 text-amber-100">
            Перед клиентским показом задайте рабочую ссылку на подарок через <code>NEIRO_GIFT_URL</code> или
            замените <code>gift_url</code> в локальном файле данных.
          </section>
        ) : null}

        {!adminReady ? (
          <section className="rounded-2xl border border-amber-300/20 bg-amber-300/[0.06] px-5 py-4 text-sm leading-6 text-amber-100">
            Для доступа к Telegram-админке задайте свой числовой ID в <code>TELEGRAM_ADMIN_USER_ID</code>.
          </section>
        ) : null}

        <section className="rounded-2xl border border-white/10 bg-white/[0.025] p-6 sm:p-8">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm text-slate-400">Активный эксперт</p>
              <h2 className="mt-1 text-2xl font-semibold">{store.expert ?? "Не настроен"}</h2>
            </div>
            <code className="w-fit rounded-lg bg-black/30 px-3 py-2 text-xs text-slate-400">GET /api/status</code>
          </div>

          <div className="mt-7 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {stats.map(([label, value]) => (
              <div key={label} className="rounded-xl border border-white/[0.07] bg-black/20 p-4">
                <p className="text-2xl font-semibold tabular-nums">{value}</p>
                <p className="mt-1 text-xs text-slate-500">{label}</p>
              </div>
            ))}
          </div>
        </section>

        <footer className="flex flex-col gap-2 pb-3 text-sm text-slate-500 sm:flex-row sm:items-center sm:justify-between">
          <span>Storage driver: {store.driver}</span>
          <span>{store.file ? `Рабочие данные: ${store.file}` : "Удалённая база: Supabase"}</span>
        </footer>
      </div>
    </main>
  );
}
