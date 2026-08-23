import { getMaterialById } from "@/lib/library/materials";
import { markMaterialOpened } from "@/lib/library/progress";
import { isLibraryEnabled } from "@/lib/library/config";
import { verifyLibraryToken } from "@/lib/security/library-token";

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

  await markMaterialOpened(payload.userId, material);
  const canonicalPath = `/library/${encodeURIComponent(material.category)}/${encodeURIComponent(material.slug)}`;
  const configuredDestination = new URL(material.url, request.url);
  const destination =
    configuredDestination.origin === new URL(request.url).origin &&
    configuredDestination.pathname.startsWith("/library/")
      ? configuredDestination
      : new URL(canonicalPath, request.url);
  destination.searchParams.set("token", token);
  return Response.redirect(destination, 303);
}
