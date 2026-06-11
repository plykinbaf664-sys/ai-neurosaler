import { getLeadById, updateLeadById } from "@/lib/supabase-rest";

function isSafeRedirect(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

export async function GET(
  request: Request,
  context: { params: Promise<{ leadId: string }> },
) {
  const { leadId } = await context.params;
  const redirectUrl = new URL(request.url).searchParams.get("redirect");

  if (!redirectUrl || !isSafeRedirect(redirectUrl)) {
    return Response.json({ ok: false, error: "Invalid redirect URL." }, { status: 400 });
  }

  const lead = await getLeadById(leadId);

  if (!lead) {
    return Response.json({ ok: false, error: "Lead not found." }, { status: 404 });
  }

  if (!lead.gift_link_clicked_at) {
    await updateLeadById(leadId, {
      giftLinkClickedAt: new Date().toISOString(),
      giftFollowupDueAt: null,
      currentStage: "gift_viewed",
    });
  }

  return Response.redirect(redirectUrl, 302);
}
