import type { LibraryMaterialRow } from "@/lib/storage";

export function formatMaterialCard(material: LibraryMaterialRow, options: { completed?: boolean; detailed?: boolean } = {}) {
  const guidance = material.guidance;
  return [
    `**${material.title}**`,
    options.completed ? "✅ Уже изучено · можно вернуться к практике" : null,
    material.short_description,
    guidance ? `**Когда пригодится**\n${guidance.when_to_use}` : null,
    guidance ? `**Что получится**\n${guidance.outcome}` : null,
    options.detailed && guidance?.steps.length ? `**С чего начать**\n${guidance.steps.slice(0, 3).map((step, i) => `${i + 1}. ${step}`).join("\n")}` : null,
  ].filter(Boolean).join("\n\n");
}
