"use client";

import Script from "next/script";
import { useCallback, useState } from "react";
import type { JourneyDashboard } from "@/lib/library/journey";
import styles from "./journey.module.css";

type WebApp = { initData: string; ready(): void; expand(): void; close(): void; openLink(url: string): void };
declare global { interface Window { Telegram?: { WebApp?: WebApp } } }
type Dashboard = JourneyDashboard & { firstName: string; remindersAvailable: boolean };

export default function JourneyPage() {
  const [data, setData] = useState<Dashboard | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState<"track" | "awards">("track");
  const load = useCallback(async (action = "view", enabled?: boolean) => {
    const app = window.Telegram?.WebApp;
    if (!app?.initData) { setError("Открой «Мой маршрут и награды» через кнопку в Telegram-боте."); return; }
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/journey", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `tma ${app.initData}` }, body: JSON.stringify({ action, enabled }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      setData(result);
    } catch (issue) { setError(issue instanceof Error ? issue.message : "Не удалось загрузить данные."); }
    finally { setBusy(false); }
  }, []);
  const close = () => window.Telegram?.WebApp?.close();
  const unlocked = data?.rewards.filter((reward) => reward.unlocked).length ?? 0;
  return (
    <main className={styles.shell}>
      <Script src="https://telegram.org/js/telegram-web-app.js" onReady={() => { window.Telegram?.WebApp?.ready(); window.Telegram?.WebApp?.expand(); void load(); }} onError={() => setError("Не удалось подключиться к Telegram. Попробуй открыть приложение заново.")} />
      <div className={styles.container}>
        <header className={styles.header}><span className={styles.brand}>✳ NEIROCLOZER</span><button onClick={close} className={styles.back}>В бот ↗</button></header>
        <section className={styles.hero}>
          <p className={styles.eyebrow}>ТВОЁ ПРОСТРАНСТВО РОСТА</p>
          <h1>Маленькие шаги.<br /><span>Твои перемены.</span></h1>
          <p className={styles.subtitle}>{data?.firstName ? `${data.firstName}, здесь ` : "Здесь "}твой маршрут, открытия и всё, что уже получилось.</p>
          <div className={styles.orbit} aria-hidden="true"><span>✦</span></div>
        </section>
        {error && <div className={styles.error} role="alert"><p>{error}</p><button onClick={() => void load()} disabled={busy}>Попробовать снова</button></div>}
        {!data && !error && <p className={styles.loading} role="status">Собираем твои достижения…</p>}
        {data && <>
          <section className={styles.stats} aria-label="Мой прогресс">
            <div><strong>{data.completed}<small> / {data.total}</small></strong><span>материалов изучено</span></div>
            <div><strong>{data.activeDays}</strong><span>активных дней</span></div>
            <div><strong>{unlocked}</strong><span>наград открыто</span></div>
          </section>
          <nav className={styles.tabs} aria-label="Разделы"><button aria-pressed={tab === "track"} onClick={() => setTab("track")}>Мой маршрут <span>↗</span></button><button aria-pressed={tab === "awards"} onClick={() => setTab("awards")}>Мои награды <span>✦</span></button></nav>
          {tab === "track" ? <section>
            <div className={styles.sectionHeading}><p className={styles.eyebrow}>С ЧЕГО НАЧАТЬ</p><h2>{data.goal || "Маршрут под твою задачу"}</h2><p>В своём темпе. По одному полезному шагу.</p></div>
            {data.track.length ? <ol className={styles.track}>{data.track.map((material, index) => <li key={material.id}>
              <span className={styles.step}>{material.completed ? "✓" : String(index + 1).padStart(2, "0")}</span>
              <article><p className={styles.kicker}>{material.completed ? "УЖЕ В КОПИЛКЕ" : "ТВОЙ СЛЕДУЮЩИЙ ШАГ"}</p><h3>{material.title}</h3><p>{material.description}</p><button className={styles.open} onClick={() => window.Telegram?.WebApp?.openLink(material.url)}>{material.completed ? "Вернуться к материалу" : "Открыть материал"} <span>↗</span></button></article>
            </li>)}</ol> : <div className={styles.empty}><span>✧</span><h3>Начнём с того, что важно тебе</h3><p>Расскажи боту, что хочешь изменить в жизни или работе. Он предложит материалы под твою задачу.</p><button className={styles.open} onClick={close}>Рассказать о задаче ↗</button></div>}
            <p className={styles.note}>После чтения вернись в бот и нажми «Я прочитал» — прогресс сохранится здесь.</p>
          </section> : <section>
            <div className={styles.sectionHeading}><p className={styles.eyebrow}>КОЛЛЕКЦИЯ ОТКРЫТИЙ</p><h2>У каждого шага<br />есть свой знак.</h2><p>Достижения остаются с тобой. Без гонки и обнулений.</p></div>
            <div className={styles.awards}>{data.rewards.map((reward) => <article key={reward.key} className={`${styles.award} ${reward.unlocked ? styles.earned : ""}`}>
              <div className={styles.medallion} aria-hidden="true"><span>{reward.symbol}</span></div><p className={styles.kicker}>{reward.unlocked ? "ОТКРЫТО ✓" : "ВПЕРЕДИ"}</p><h3>{reward.title}</h3><p>{reward.description}</p>
              <progress max={reward.target} value={reward.unlocked ? reward.target : reward.current} aria-label={reward.description} /><small>{reward.unlocked ? "В твоей коллекции" : `${reward.current} из ${reward.target}`}</small>
            </article>)}</div><p className={styles.note}>Активный день — день, когда ты общался с ботом, работал с материалами или открывал это пространство. Счёт идёт по UTC с момента включения функции.</p>
          </section>}
          <section className={styles.reminder}><div><h3>Мягкие напоминания</h3><p>{data.remindersAvailable ? "Предложим следующий шаг, если ты отвлечёшься. Не чаще раза в сутки." : "Автоматические напоминания пока недоступны."}</p></div><button role="switch" aria-label="Напоминания" aria-checked={data.remindersEnabled && data.remindersAvailable} disabled={busy || !data.remindersAvailable} onClick={() => void load("reminders", !data.remindersEnabled)} className={styles.toggle}><span /></button></section>
          <footer className={styles.footer}><span>Твой темп. Твоя траектория.</span><button onClick={() => void load()} disabled={busy}>{busy ? "Обновляем…" : "Обновить ↻"}</button></footer>
        </>}
      </div>
    </main>
  );
}
