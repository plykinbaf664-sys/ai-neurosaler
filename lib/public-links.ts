export function getPublicBaseUrl(request?: Request) {
  const production = process.env.VERCEL_ENV === "production";
  const productionHost = production ? process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim() : undefined;
  const host = request?.headers.get("x-forwarded-host")?.split(",")[0].trim();
  const protocol = request?.headers.get("x-forwarded-proto")?.split(",")[0].trim();
  const forwarded = host && (protocol === "https" || protocol === "http") ? `${protocol}://${host}` : null;
  // Public app links must not inherit an old development webhook tunnel.
  // The Vercel production domain is stable across deployments; preview/local requests keep their origin.
  const candidates = [process.env.PUBLIC_BASE_URL, process.env.NEXT_PUBLIC_APP_URL,
    productionHost ? `https://${productionHost}` : null,
    forwarded, request?.url, process.env.TELEGRAM_WEBHOOK_BASE_URL,
    production ? null : "http://localhost:3000"];
  for (const candidate of candidates) {
    if (!candidate?.trim()) continue;
    const url = new URL(candidate.trim());
    if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) throw new Error("Invalid public base URL.");
    const temporary = /(^|\.)(ngrok-free\.(app|dev)|ngrok\.(app|io|dev)|localhost)$/i.test(url.hostname)
      || ["127.0.0.1", "[::1]", "0.0.0.0"].includes(url.hostname);
    if (production && (temporary || url.protocol !== "https:")) continue;
    return url.origin;
  }
  throw new Error("Set PUBLIC_BASE_URL to the permanent HTTPS application URL.");
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
