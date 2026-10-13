import "server-only";

export type AiProvider = "anthropic" | "qwen";
export class AiConfigurationError extends Error {
  constructor(message: string) { super(message); this.name = "AiConfigurationError"; }
}

function selectedProvider(): AiProvider {
  // Existing deployments without this setting keep their current provider.
  const value = process.env.AI_PROVIDER?.trim().toLowerCase() || "anthropic";
  if (value !== "anthropic" && value !== "qwen") {
    throw new AiConfigurationError("AI_PROVIDER must be qwen or anthropic.");
  }
  return value;
}

function modelFor(provider: AiProvider) {
  return provider === "qwen" ? process.env.QWEN_MODEL?.trim() || "qwen-plus"
    : process.env.ANTHROPIC_MODEL?.trim() || "claude-sonnet-4-20250514";
}

function qwenEndpoint() {
  const raw = process.env.QWEN_BASE_URL?.trim();
  if (!raw) throw new AiConfigurationError("Set QWEN_BASE_URL to the OpenAI-compatible base URL from your Qwen console.");
  let url: URL;
  try { url = new URL(raw); } catch { throw new AiConfigurationError("QWEN_BASE_URL must be a valid HTTPS URL."); }
  if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash || /[{}<>]|%7[bd]|%3[ce]/i.test(raw)) {
    throw new AiConfigurationError("QWEN_BASE_URL must be HTTPS, without credentials, query parameters or placeholders.");
  }
  // Accept a base URL or the full HTTP endpoint copied from the console.
  url.pathname = url.pathname.replace(/\/+$/, "").replace(/\/chat\/completions$/, "") + "/chat/completions";
  return url.toString();
}

export function getAiConfig() {
  const provider = selectedProvider();
  const keyName = provider === "qwen" ? "QWEN_API_KEY" : "ANTHROPIC_API_KEY";
  const apiKey = process.env[keyName]?.trim();
  if (!apiKey) throw new AiConfigurationError(`Set ${keyName} for the selected AI provider.`);
  return { provider, apiKey, model: modelFor(provider),
    endpoint: provider === "qwen" ? qwenEndpoint() : "https://api.anthropic.com/v1/messages" };
}

// Safe for the runtime dashboard/status endpoint: never return a key or endpoint.
export function getAiStatus() {
  let provider: AiProvider | null = null;
  let model: string | null = null;
  try {
    provider = selectedProvider();
    model = modelFor(provider);
    getAiConfig();
    return { provider, model, configured: true, configurationError: null };
  } catch (error) {
    return { provider, model, configured: false,
      configurationError: error instanceof AiConfigurationError ? error.message : "Invalid AI configuration." };
  }
}
