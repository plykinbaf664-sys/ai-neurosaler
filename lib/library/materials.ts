import "server-only";

import {
  getActiveLibraryMaterialBySlug,
  getActiveLibraryMaterials,
  getLibraryMaterialById,
} from "@/lib/storage";

export function getCategoryMaterials(category: string) {
  return getActiveLibraryMaterials(category);
}

export function getMaterialById(materialId: string) {
  return getLibraryMaterialById(materialId);
}

export function getMaterialBySlug(category: string, slug: string) {
  return getActiveLibraryMaterialBySlug(category, slug);
}
