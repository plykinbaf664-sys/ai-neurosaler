import { AiConfigurationError, getAiConfig, type AiProvider } from "@/lib/neiroclozer/ai-config";

type AnthropicContentItem = {
  type?: string;
  text?: string;
};

type AnthropicResponse = {
  content?: AnthropicContentItem[];
  stop_reason?: string;
};

type QwenResponse = {
  choices?: { message?: { content?: string | null }; finish_reason?: string }[];
};

const ANTHROPIC_API_VERSION = "2023-06-01";
export const DEFAULT_REPLY_TOKENS = 900;
export const DEFAULT_MATERIAL_ANALYSIS_TOKENS = 1500;

export class AiProviderError extends Error {
  constructor(readonly status: number, readonly reason: string, readonly requestId: string | null, readonly provider: AiProvider) {
    super(`AI provider unavailable: ${reason} (HTTP ${status})`);
    this.name = "AiProviderError";
  }
}

export function summarizeAiFailure(error: unknown) {
  return error instanceof AiProviderError ? { provider: error.provider, status: error.status, reason: error.reason, requestId: error.requestId }
    : error instanceof AiConfigurationError ? { reason: "configuration_error", message: error.message }
    : { reason: error instanceof Error ? error.name : "unknown" };
}

function extractResponseText(responseData: AnthropicResponse) {
  return (
    responseData.content
      ?.filter((item) => item.type === "text")
      .map((item) => item.text?.trim())
      .filter((item): item is string => Boolean(item))
      .join("\n")
      .trim() || ""
  );
}

export async function generateAiText(prompt: string, maxTokens = DEFAULT_REPLY_TOKENS, options: { json?: boolean } = {}) {
  const config = getAiConfig();
  const isQwen = config.provider === "qwen";
  const response = await fetch(config.endpoint, {
    method: "POST",
    signal: AbortSignal.timeout(30_000),
    cache: "no-store",
    redirect: "error",
    headers: {
      "Content-Type": "application/json",
      ...(isQwen ? { Authorization: `Bearer ${config.apiKey}` }
        : { "x-api-key": config.apiKey, "anthropic-version": ANTHROPIC_API_VERSION }),
    },
    body: JSON.stringify({
      model: config.model,
      max_tokens: maxTokens,
      messages: [{ role: "user", content: prompt }],
      ...(isQwen ? { stream: false, enable_thinking: false,
        ...(options.json ? { response_format: { type: "json_object" } } : {}) } : {}),
    }),
  });

  if (!response.ok) {
    const detail = await response.json().catch(() => ({})) as { error?: { message?: string; type?: string; code?: string } };
    const description = JSON.stringify(detail.error ?? {}).toLowerCase();
    const reason = /credit balance|insufficient_quota|arrearage|insufficient.balance/.test(description) || response.status === 402 ? "insufficient_credits"
      : response.status === 429 ? "rate_limited" : response.status === 401 ? "authentication_failed"
        : response.status === 403 ? "access_denied" : response.status === 404 ? "model_or_endpoint_not_found"
          : response.status === 400 ? "invalid_request" : "upstream_error";
    const requestId = response.headers.get("request-id") ?? response.headers.get("x-request-id");
    throw new AiProviderError(response.status, reason, requestId?.slice(0, 120) ?? null, config.provider);
  }

  const responseData = (await response.json()) as AnthropicResponse & QwenResponse;
  if (responseData.stop_reason === "max_tokens" || responseData.choices?.[0]?.finish_reason === "length") {
    throw new AiProviderError(200, "response_truncated", null, config.provider);
  }
  const content = responseData.choices?.[0]?.message?.content;
  const replyText = isQwen ? (typeof content === "string" ? content.trim() : "") : extractResponseText(responseData);

  if (!replyText) {
    throw new AiProviderError(200, "empty_response", null, config.provider);
  }

  return replyText.trim();
}

export async function generateNeiroReply(prompt: string) {
  return generateAiText(prompt, DEFAULT_REPLY_TOKENS);
}
