import "server-only";
import type { sendTextMessage } from "@/lib/telegram";
import { isLibraryEnabled } from "@/lib/library/config";

export function withMainMenu(markup?: Parameters<typeof sendTextMessage>[2]) {
  const rows = markup?.inline_keyboard ?? [];
  if (rows.some((row) => row.some((button) => ["nav:menu", "nav:marketing"].includes(button.callback_data ?? "")))) return markup!;
  return { ...markup, inline_keyboard: [...rows, [{ text: "🏠 Главное меню", callback_data: isLibraryEnabled() ? "nav:menu" : "/start" }]] };
}
