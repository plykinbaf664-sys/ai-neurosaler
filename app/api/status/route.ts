import { getLocalStoreSummary } from "@/lib/storage";
import { isLibraryEnabled, isLibraryLinkSecretConfigured } from "@/lib/library/config";
import { getAiStatus } from "@/lib/neiroclozer/ai-config";
import { getMiniAppUrl, getPublicBaseUrl } from "@/lib/public-links";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const store = await getLocalStoreSummary();
    const ai = getAiStatus();

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
        ai: ai.configured,
        cron: Boolean(process.env.CRON_SECRET),
      },
      ai,
      library: {
        enabled: isLibraryEnabled(),
        linkSecretConfigured: isLibraryLinkSecretConfigured(),
        miniAppUrl: getMiniAppUrl(getPublicBaseUrl(request)),
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown storage error.";
    return Response.json({ ok: false, error: message }, { status: 500 });
  }
}
