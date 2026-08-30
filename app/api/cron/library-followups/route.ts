import { sendDueLibraryFollowups } from "@/lib/library/followups";

export const runtime = "nodejs";

function isAuthorizedCronRequest(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) throw new Error("Missing CRON_SECRET.");
  return request.headers.get("authorization") === `Bearer ${cronSecret}`;
}

export async function GET(request: Request) {
  try {
    if (!isAuthorizedCronRequest(request)) {
      return Response.json({ ok: false, error: "Unauthorized." }, { status: 401 });
    }

    const result = await sendDueLibraryFollowups();
    return Response.json({ ok: true, ...result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown cron error.";
    console.error("Library followups cron error:", message);
    return Response.json({ ok: false, error: message }, { status: 500 });
  }
}
