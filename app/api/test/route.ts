import { buildNeiroPrompt } from "@/lib/neiroclozer/prompt-builder";
import { generateNeiroReply } from "@/lib/neiroclozer/generate-reply";
import {
  getActiveExpertFaq,
  getActiveExpertObjections,
  getActiveExpertOffers,
  getActiveExpertProfile,
  getLeadByTelegramUserId,
  getRecentMessagesByLeadId,
} from "@/lib/supabase-rest";

export async function GET(request: Request) {
  const telegramUserIdParam = new URL(request.url).searchParams.get("telegramUserId");
  const telegramUserId = Number(telegramUserIdParam);

  if (!telegramUserIdParam || !Number.isFinite(telegramUserId)) {
    return Response.json({ ok: false, error: "Missing telegramUserId query param." }, { status: 400 });
  }

  const expert = await getActiveExpertProfile();

  if (!expert) {
    return Response.json({ ok: false, error: "Active expert_profile not found." }, { status: 500 });
  }

  const lead = await getLeadByTelegramUserId(telegramUserId);

  if (!lead) {
    return Response.json({ ok: false, error: "Lead not found." }, { status: 404 });
  }

  const [offers, faq, objections, messages] = await Promise.all([
    getActiveExpertOffers(expert.id),
    getActiveExpertFaq(expert.id),
    getActiveExpertObjections(expert.id),
    getRecentMessagesByLeadId(lead.id, 4),
  ]);

  const prompt = buildNeiroPrompt({
    expert,
    offers,
    faq,
    objections,
    lead,
    messages,
  });
  const reply = await generateNeiroReply(prompt);

  console.log(reply);

  return Response.json({ ok: true, reply });
}
