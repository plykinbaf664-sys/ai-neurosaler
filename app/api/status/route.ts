import { getLocalStoreSummary } from "@/lib/data-store";

export const runtime = "nodejs";

export async function GET() {
  try {
    const store = await getLocalStoreSummary();

    return Response.json({
      ok: true,
      storage: {
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
        ai: Boolean(process.env.ANTHROPIC_API_KEY),
        cron: Boolean(process.env.CRON_SECRET),
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown local store error.";
    return Response.json({ ok: false, error: message }, { status: 500 });
  }
}
