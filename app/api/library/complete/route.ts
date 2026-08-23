import { getMaterialById } from "@/lib/library/materials";
import { isLibraryEnabled } from "@/lib/library/config";
import { markMaterialCompleted } from "@/lib/library/progress";
import { unlockCategoryReward } from "@/lib/library/rewards";
import { verifyLibraryToken } from "@/lib/security/library-token";

export const runtime = "nodejs";

export async function POST(request: Request) {
  if (!isLibraryEnabled()) return new Response("Library is disabled.", { status: 404 });
  const formData = await request.formData();
  const token = typeof formData.get("token") === "string" ? String(formData.get("token")) : "";
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

  const progress = await markMaterialCompleted(payload.userId, material);
  await unlockCategoryReward(payload.userId, progress);
  const destination = new URL(
    `/library/${encodeURIComponent(material.category)}/${encodeURIComponent(material.slug)}`,
    request.url,
  );
  destination.searchParams.set("token", token);
  destination.searchParams.set("completed", "1");
  return Response.redirect(destination, 303);
}
