export function getPublicBaseUrl(request?: Request) {
  const configured = process.env.TELEGRAM_WEBHOOK_BASE_URL || process.env.PUBLIC_BASE_URL || process.env.NEXT_PUBLIC_APP_URL;
  // Config may contain the webhook path. Links always start at the public origin.
  const host = request?.headers.get("x-forwarded-host")?.split(",")[0].trim();
  const protocol = request?.headers.get("x-forwarded-proto")?.split(",")[0].trim();
  const forwarded = host && (protocol === "https" || protocol === "http") ? `${protocol}://${host}` : null;
  const url = new URL(configured?.trim() || forwarded || request?.url || "http://localhost:3000");
  if (!["http:", "https:"].includes(url.protocol)) throw new Error("Invalid public base URL.");
  return url.origin;
}

export function getCalendarLink() {
  const url = new URL(process.env.CALENDAR_LINK?.trim() || "https://calendar.app.google/rpFMG61ce4dXL54z5");
  if (!["http:", "https:"].includes(url.protocol)) throw new Error("Invalid CALENDAR_LINK.");
  return url.toString();
}

export function getMiniAppUrl(baseUrl: string) {
  const url = new URL("/journey", baseUrl);
  return url.protocol === "https:" ? url.toString() : null;
}
