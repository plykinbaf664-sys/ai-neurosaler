// Native menu configuration only; never sends chat messages or touches CRM.
const token = process.env.TELEGRAM_BOT_TOKEN?.trim();
if (!token) throw new Error("TELEGRAM_BOT_TOKEN is required.");
const apply = process.argv.includes("--apply");
async function call(method, body = {}) {
  const response = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body), signal: AbortSignal.timeout(15000),
  });
  const data = await response.json();
  if (!response.ok || !data.ok) throw new Error(`${method} failed (${response.status}).`);
  return data.result;
}
// Use the already deployed /start command so the menu is usable before the next deployment.
// Preserve other commands and language-specific entries in private chats.
for (const language_code of ["", "ru"]) {
  const scope = { type: "all_private_chats" };
  const current = await call("getMyCommands", { scope, language_code });
  const inherited = current.length ? current : await call("getMyCommands", { language_code });
  const commands = [{ command: "start", description: "🏠 Главное меню" }, ...inherited.filter(item => item.command !== "start")];
  if (commands.length > 100) throw new Error("Command limit exceeded; existing commands were preserved.");
  if (apply) await call("setMyCommands", { scope, language_code, commands });
  console.log(JSON.stringify({ applied: apply, scope: scope.type, language: language_code || "default",
    commands: apply ? await call("getMyCommands", { scope, language_code }) : commands }));
}
const previous = await call("getChatMenuButton");
if (apply && previous.type !== "commands") await call("setChatMenuButton", { menu_button: { type: "commands" } });
console.log(JSON.stringify({ menuButton: apply ? await call("getChatMenuButton") : previous }));
