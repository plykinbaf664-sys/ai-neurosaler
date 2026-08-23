export const LIBRARY_CATEGORIES = [
  { slug: "life", label: "AI для жизни", buttonLabel: "🧠 AI для жизни" },
  { slug: "business", label: "AI для бизнеса", buttonLabel: "🚀 AI для бизнеса" },
] as const;

export function isLibraryEnabled() {
  return process.env.LIBRARY_ENABLED === "true";
}

export function isLibraryLinkSecretConfigured() {
  return (process.env.LIBRARY_LINK_SECRET?.trim().length ?? 0) >= 24;
}

export function getLibraryCategory(category: string) {
  return LIBRARY_CATEGORIES.find((item) => item.slug === category) ?? null;
}

export function getLibraryCategoryLabel(category: string) {
  return getLibraryCategory(category)?.label ?? category;
}
