import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { claimVisualAsset, finishVisualAsset, getVisualAsset } from "@/lib/storage";
import { sendPhoto, sendVideoNote } from "@/lib/telegram";
import { trackUserEvent } from "@/lib/tracking/events";

type VisualScreen = {
  screenKey: string;
  type: "onboarding" | "category" | "result" | "material" | "followup";
  title: string;
  description: string;
  category?: string;
  materialSlug?: string;
};

export function buildVisualPrompt(screen: VisualScreen) {
  return [
    "Create one clean, adult, premium editorial photograph / still life with a clear visual metaphor.",
    "No robots, holograms, neon, generic AI brains, busy dashboards, logos or lettering. No text in the image.",
    screen.category === "life" ? "Warm natural light, human everyday setting, approachable and calm." : "Business editorial, cinematic natural light, restrained premium palette, generous negative space.",
    "Tone: practical, direct, thoughtful. Show the meaning rather than a decorative AI symbol.",
    JSON.stringify({ screen_type: screen.type, title: screen.title, description: screen.description,
      category: screen.category ?? "business", material_slug: screen.materialSlug ?? null }),
  ].join("\n");
}

async function generateImage(prompt: string) {
  if (process.env.IMAGE_PROVIDER !== "openai") throw new Error("Unsupported image provider");
  const key = process.env.IMAGE_API_KEY?.trim();
  const model = process.env.IMAGE_MODEL?.trim();
  if (!key || !model) throw new Error("Missing image provider configuration");
  // Separate image capability: Qwen/Anthropic text generation stays untouched.
  const response = await fetch("https://api.openai.com/v1/images/generations", {
    method: "POST", headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model, prompt, size: "1024x1024", quality: "low", output_format: "png", n: 1 }),
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) throw new Error(`Image provider HTTP ${response.status}`);
  const data = await response.json() as { data?: { b64_json?: string }[] };
  const encoded = data.data?.[0]?.b64_json;
  if (!encoded || encoded.length > 14_000_000) throw new Error("Invalid image response");
  return new Uint8Array(Buffer.from(encoded, "base64"));
}

export async function sendGeneratedVisual(chatId: number, userId: string, screen: VisualScreen) {
  if (process.env.IMAGE_GENERATION_ENABLED !== "true") return false;
  // Ready assets belong to the screen and bot, not to the model used to create them.
  // Provider/model/key changes must never cause a paid regeneration of a ready screen.
  const botId = process.env.TELEGRAM_BOT_TOKEN?.split(":")[0] ?? "";
  const botHash = createHash("sha256").update(botId).digest("hex").slice(0, 16);
  const key = `${screen.screenKey}:${botHash}:v1`;
  const token = randomUUID();
  let claimed = false;
  try {
    let cached = await getVisualAsset(key);
    if (!cached?.file_id) {
      // Reuse assets produced by the first implementation without regenerating them.
      const legacyHash = createHash("sha256").update([process.env.TELEGRAM_BOT_TOKEN, process.env.IMAGE_PROVIDER, process.env.IMAGE_MODEL, "v1"].join(":")).digest("hex").slice(0, 16);
      const legacy = await getVisualAsset(`${screen.screenKey}:${legacyHash}`);
      if (legacy?.file_id) {
        if (await claimVisualAsset(key, token, new Date().toISOString(), new Date(Date.now() + 300_000).toISOString())) {
          await finishVisualAsset(key, token, legacy.file_id, new Date().toISOString());
        }
        cached = legacy;
      }
    }
    if (cached?.file_id) {
      await sendPhoto(chatId, cached.file_id);
    } else {
      // Credentials are needed only on a cache miss. Ready assets keep working without them.
      if (process.env.IMAGE_PROVIDER !== "openai" || !process.env.IMAGE_MODEL?.trim() || !process.env.IMAGE_API_KEY?.trim()) {
        console.error("Generated visual configuration missing", screen.screenKey);
        return false;
      }
      claimed = await claimVisualAsset(key, token, new Date().toISOString(), new Date(Date.now() + 300_000).toISOString());
      if (!claimed) return false;
      const photo = await generateImage(buildVisualPrompt(screen));
      const fileId = await sendPhoto(chatId, photo);
      await finishVisualAsset(key, token, fileId, new Date().toISOString());
    }
  } catch (error) {
    console.error("Generated visual fallback", screen.screenKey, error instanceof Error ? error.name : "unknown");
    if (claimed) await finishVisualAsset(key, token, null, new Date(Date.now() + 86_400_000).toISOString()).catch(() => undefined);
    return false;
  }
  await trackUserEvent({ userId, eventName: "generated_visual_sent", metadata: { screen_key: screen.screenKey } }).catch(() => undefined);
  return true;
}

export async function sendWelcomeVideo(chatId: number, userId: string) {
  const fileId = process.env.WELCOME_VIDEO_NOTE_FILE_ID?.trim();
  if (process.env.WELCOME_VIDEO_ENABLED !== "true" || !fileId) return;
  try {
    await sendVideoNote(chatId, fileId);
    await trackUserEvent({ userId, eventName: "welcome_video_sent" });
  } catch (error) {
    console.error("Welcome video fallback", error instanceof Error ? error.name : "unknown");
  }
}
