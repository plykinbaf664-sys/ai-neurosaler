// Config-only by default. --live makes ONE small model request; no CRM or Telegram access.
import "../tests/register-typescript.mjs";
const { getAiStatus } = await import("../lib/neiroclozer/ai-config.ts");
const { generateAiText, summarizeAiFailure } = await import("../lib/neiroclozer/generate-reply.ts");
const status = getAiStatus();
console.log(JSON.stringify(status, null, 2));
if (!status.configured) {
  process.exitCode = 1;
} else if (!process.argv.includes("--live")) {
  console.log("Configuration is complete. Use --live to verify the key, endpoint, model and JSON response with one API request.");
} else {
  try {
    const answer = await generateAiText('Return exactly this JSON object, with no other text: {"ok":true}', 100, { json: true });
    if (JSON.parse(answer).ok !== true) throw new Error("UnexpectedResponse");
    console.log("AI connection and JSON output: OK. No Telegram messages or database writes.");
  } catch (error) {
    const failure = summarizeAiFailure(error);
    console.error(JSON.stringify(failure));
    const hints = {
      authentication_failed: "Check the API key and that its region matches QWEN_BASE_URL.",
      access_denied: "Check model access and activation in the provider console.",
      model_or_endpoint_not_found: "Copy the exact base URL and model ID from the provider console.",
      insufficient_credits: "Check the provider balance/quota.",
      invalid_request: "Use a chat model supporting non-thinking mode and JSON output (default: qwen-plus).",
      rate_limited: "Provider rate limit reached. Retry later.",
    };
    console.error(hints[failure.reason] ?? "Connection or response check failed. Check provider availability and configuration.");
    process.exitCode = 1;
  }
}
