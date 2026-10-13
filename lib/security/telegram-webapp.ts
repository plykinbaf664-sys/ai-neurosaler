import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";

// https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app
export function verifyTelegramWebAppData(initData: string, now = Date.now()) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token || !initData || initData.length > 16_384) return null;
  try {
    const params = new URLSearchParams(initData);
    if (new Set(params.keys()).size !== [...params.keys()].length) return null;
    const hash = params.get("hash") ?? "";
    if (!/^[a-f0-9]{64}$/i.test(hash)) return null;
    params.delete("hash");
    params.sort();
    const data = [...params].map(([key, value]) => `${key}=${value}`).join("\n");
    const secret = createHmac("sha256", "WebAppData").update(token).digest();
    const expected = createHmac("sha256", secret).update(data).digest();
    if (!timingSafeEqual(expected, Buffer.from(hash, "hex"))) return null;
    const timestamp = Number(params.get("auth_date"));
    const age = now / 1000 - timestamp;
    if (!Number.isSafeInteger(timestamp) || age < -30 || age > 3600) return null;
    const user = JSON.parse(params.get("user") ?? "null") as { id?: unknown; first_name?: unknown } | null;
    if (!user || !Number.isSafeInteger(user.id) || Number(user.id) <= 0) return null;
    return { id: Number(user.id), firstName: typeof user.first_name === "string" ? user.first_name.slice(0, 100) : "" };
  } catch { return null; }
}
