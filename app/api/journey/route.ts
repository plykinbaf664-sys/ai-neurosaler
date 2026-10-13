import { getLeadByTelegramUserId, recordUserActivity, upsertUserLibraryProfile } from "@/lib/storage";
import { verifyTelegramWebAppData } from "@/lib/security/telegram-webapp";
import { getJourneyDashboard } from "@/lib/library/journey";
import { isLibraryEnabled } from "@/lib/library/config";
import { isLibraryFollowupsEnabled, scheduleNextStepFollowup } from "@/lib/library/followups";
import { getPublicBaseUrl } from "@/lib/public-links";

export const runtime = "nodejs";
const headers = { "Cache-Control": "private, no-store" };
export async function POST(request: Request) {
  if (!isLibraryEnabled()) return Response.json({ error: "Раздел временно недоступен." }, { status: 404, headers });
  const authorization = request.headers.get("authorization") ?? "";
  const user = authorization.startsWith("tma ") ? verifyTelegramWebAppData(authorization.slice(4)) : null;
  if (!user) return Response.json({ error: "Открой приложение заново через кнопку в боте." }, { status: 401, headers });
  if (Number(request.headers.get("content-length") ?? "0") > 2048) return new Response(null, { status: 413, headers });
  let input: { action?: string; enabled?: boolean };
  try { input = await request.json(); } catch { return Response.json({ error: "Неверный запрос." }, { status: 400, headers }); }
  if (!input || !["view", "reminders"].includes(input.action ?? "view") || (input.action === "reminders" && typeof input.enabled !== "boolean")) {
    return Response.json({ error: "Неверный запрос." }, { status: 400, headers });
  }
  try {
    const lead = await getLeadByTelegramUserId(user.id);
    if (!lead) return Response.json({ error: "Сначала нажми /start в боте." }, { status: 404, headers });
    if (input.action === "reminders") {
      await upsertUserLibraryProfile(lead.id, { reminders_enabled: input.enabled, next_followup_due_at: null });
      if (input.enabled) await scheduleNextStepFollowup(lead.id);
    }
    await recordUserActivity(lead.id);
    const dashboard = await getJourneyDashboard(lead.id, getPublicBaseUrl(request));
    return Response.json({ ...dashboard, firstName: user.firstName, remindersAvailable: isLibraryFollowupsEnabled() }, { headers });
  } catch (error) {
    console.error("Journey API failed:", error instanceof Error ? error.name : "unknown");
    return Response.json({ error: "Не удалось загрузить маршрут. Попробуй ещё раз чуть позже." }, { status: 503, headers });
  }
}
