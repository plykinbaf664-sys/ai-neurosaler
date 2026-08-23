import "server-only";

import { insertUserEvent, type UserEventInsertInput } from "@/lib/storage";

const MAX_EVENT_METADATA_CHARS = 2_000;

function sanitizeMetadata(metadata: Record<string, unknown> | undefined) {
  if (!metadata) return {};
  const serialized = JSON.stringify(metadata);
  return serialized.length <= MAX_EVENT_METADATA_CHARS ? metadata : { metadata_truncated: true };
}

export function trackUserEvent(input: UserEventInsertInput) {
  return insertUserEvent({ ...input, metadata: sanitizeMetadata(input.metadata) });
}
