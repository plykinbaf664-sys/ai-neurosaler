import { getDueGiftFollowupLeads, insertMessage, updateLeadById } from "@/lib/supabase-rest";
import { sendTextMessage } from "@/lib/telegram";

const GIFT_FOLLOWUP_TEXT = "Получилось посмотреть видео?";

function isAuthorizedCronRequest(request: Request) {
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret) {
    throw new Error("Missing CRON_SECRET.");
  }

  const authorization = request.headers.get("authorization");
  return authorization === `Bearer ${cronSecret}`;
}

export async function GET(request: Request) {
  try {
    if (!isAuthorizedCronRequest(request)) {
      return Response.json({ ok: false, error: "Unauthorized." }, { status: 401 });
    }

    const dueLeads = await getDueGiftFollowupLeads(new Date().toISOString());
    let sentCount = 0;

    for (const lead of dueLeads) {
      const followupResult = await sendTextMessage(lead.telegram_chat_id, GIFT_FOLLOWUP_TEXT);

      await insertMessage({
        leadId: lead.id,
        expertProfileId: lead.expert_profile_id,
        direction: "outgoing",
        channel: "telegram",
        telegramMessageId: followupResult.telegramMessageId,
        text: GIFT_FOLLOWUP_TEXT,
        messageType: "gift_followup",
      });

      await updateLeadById(lead.id, {
        giftFollowupSentAt: new Date().toISOString(),
        giftFollowupDueAt: null,
        currentStage: "gift_followup_sent",
      });

      sentCount += 1;
    }

    return Response.json({ ok: true, processed: dueLeads.length, sent: sentCount });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown cron error.";
    console.error("Gift followups cron error:", message);
    return Response.json({ ok: false, error: message }, { status: 500 });
  }
}
