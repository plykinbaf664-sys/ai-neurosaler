import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";

export type LibraryTokenPayload = {
  version: 1;
  userId: string;
  materialId: string;
  category: string;
  slug: string;
  expiresAt: number;
};

const TOKEN_TTL_SECONDS = 15 * 60;
const SAFE_VALUE_PATTERN = /^[a-z0-9][a-z0-9_-]{0,79}$/i;

function getSecret() {
  const secret = process.env.LIBRARY_LINK_SECRET?.trim();
  if (!secret || secret.length < 24) {
    throw new Error("LIBRARY_LINK_SECRET must contain at least 24 characters.");
  }
  return secret;
}

function sign(encodedPayload: string) {
  return createHmac("sha256", getSecret()).update(encodedPayload).digest("base64url");
}

export function createLibraryToken(
  input: Pick<LibraryTokenPayload, "userId" | "materialId" | "category" | "slug">,
) {
  const payload: LibraryTokenPayload = {
    version: 1,
    ...input,
    expiresAt: Math.floor(Date.now() / 1_000) + TOKEN_TTL_SECONDS,
  };
  const encodedPayload = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  return `${encodedPayload}.${sign(encodedPayload)}`;
}

export function verifyLibraryToken(token: string): LibraryTokenPayload | null {
  if (!token || token.length > 2_000) return null;
  const [encodedPayload, providedSignature, extra] = token.split(".");
  if (!encodedPayload || !providedSignature || extra) return null;

  try {
    const expectedSignature = sign(encodedPayload);
    const expected = Buffer.from(expectedSignature);
    const provided = Buffer.from(providedSignature);
    if (expected.length !== provided.length || !timingSafeEqual(expected, provided)) return null;

    const payload = JSON.parse(Buffer.from(encodedPayload, "base64url").toString("utf8")) as LibraryTokenPayload;
    if (
      payload.version !== 1 ||
      typeof payload.userId !== "string" ||
      typeof payload.materialId !== "string" ||
      typeof payload.expiresAt !== "number" ||
      !SAFE_VALUE_PATTERN.test(payload.category) ||
      !SAFE_VALUE_PATTERN.test(payload.slug) ||
      payload.expiresAt < Math.floor(Date.now() / 1_000)
    ) {
      return null;
    }
    return payload;
  } catch {
    return null;
  }
}
