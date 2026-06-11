type AnthropicContentItem = {
  type?: string;
  text?: string;
};

type AnthropicResponse = {
  content?: AnthropicContentItem[];
};

const DEFAULT_ANTHROPIC_MODEL = "claude-sonnet-4-20250514";
const ANTHROPIC_API_VERSION = "2023-06-01";
const MAX_REPLY_TOKENS = 220;

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

export async function generateNeiroReply(prompt: string) {
  const apiKey = process.env.ANTHROPIC_API_KEY;

  if (!apiKey) {
    throw new Error("Missing ANTHROPIC_API_KEY.");
  }

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": ANTHROPIC_API_VERSION,
    },
    body: JSON.stringify({
      model: process.env.ANTHROPIC_MODEL || DEFAULT_ANTHROPIC_MODEL,
      max_tokens: MAX_REPLY_TOKENS,
      messages: [{ role: "user", content: prompt }],
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Anthropic API request failed: ${response.status} ${errorText}`);
  }

  const responseData = (await response.json()) as AnthropicResponse;
  const replyText = extractResponseText(responseData);

  if (!replyText) {
    throw new Error("Anthropic API returned an empty response.");
  }

  return replyText.trim();
}
