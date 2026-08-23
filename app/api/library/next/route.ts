import { isLibraryEnabled } from "@/lib/library/config";
import { getMaterialById } from "@/lib/library/materials";
import { verifyLibraryToken } from "@/lib/security/library-token";
import { trackUserEvent } from "@/lib/tracking/events";

export const runtime = "nodejs";

export async function GET(request: Request) {
  if (!isLibraryEnabled()) return new Response("Library is disabled.", { status: 404 });
  const token = new URL(request.url).searchParams.get("token") ?? "";
  const payload = verifyLibraryToken(token);
  if (!payload) return new Response("Library link is invalid or expired.", { status: 401 });

  const material = await getMaterialById(payload.materialId);
  if (
    !material?.is_active ||
    material.category !== payload.category ||
    material.slug !== payload.slug
  ) {
    return new Response("Material not found.", { status: 404 });
  }

  await trackUserEvent({
    userId: payload.userId,
    eventName: "next_material_clicked",
    materialId: material.id,
    category: material.category,
    metadata: { topic: material.topic },
  });
  const destination = new URL("/api/library/open", request.url);
  destination.searchParams.set("token", token);
  return Response.redirect(destination, 303);
}
