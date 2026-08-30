import "server-only";

function readPositiveInteger(name: string, fallback: number, ceiling: number) {
  const parsed = Number.parseInt(process.env[name] ?? "", 10);

  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }

  return Math.min(parsed, ceiling);
}

export const MAX_MESSAGE_HISTORY = readPositiveInteger("MAX_MESSAGE_HISTORY", 12, 12);
export const MAX_MATERIAL_TEXT_CHARS = readPositiveInteger("MAX_MATERIAL_TEXT_CHARS", 12_000, 50_000);
export const MAX_MATERIALS_PER_LEAD = readPositiveInteger("MAX_MATERIALS_PER_LEAD", 2, 10);
export const MAX_STORED_MESSAGE_CHARS = 8_000;

export function truncateStoredText(value: string | null | undefined, limit: number) {
  if (value === null || value === undefined) {
    return value ?? null;
  }

  return value.length > limit ? value.slice(0, limit) : value;
}
