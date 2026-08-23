import { getLocalStoreSummary } from "@/lib/storage";

export const runtime = "nodejs";

export async function GET() {
  try {
    const store = await getLocalStoreSummary();

    return Response.json({
      ok: true,
      storage: {
        driver: store.driver,
        mode: store.mode,
        expertLoaded: Boolean(store.expert),
        giftUrlConfigured: store.giftReady,
        offers: store.offers,
        faq: store.faq,
        objections: store.objections,
        leads: store.leads,
        messages: store.messages,
        materials: store.materials,
      },
      integrations: {
        telegram: Boolean(process.env.TELEGRAM_BOT_TOKEN),
        telegramAdmin: Boolean(process.env.TELEGRAM_ADMIN_USER_ID),
        ai: Boolean(process.env.ANTHROPIC_API_KEY),
        cron: Boolean(process.env.CRON_SECRET),
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown storage error.";
    return Response.json({ ok: false, error: message }, { status: 500 });
  }
}
