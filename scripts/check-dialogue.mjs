// Explicit opt-in: two AI requests using synthetic history, local memory, and no Telegram sends.
import "../tests/register-typescript.mjs";
import assert from "node:assert/strict";
if (!process.argv.includes("--live")) throw new Error("Pass --live to use the configured AI provider.");
Object.assign(process.env, { STORAGE_DRIVER: "local", LOCAL_DATA_MODE: "memory", LIBRARY_ENABLED: "true", LIBRARY_FOLLOWUPS_ENABLED: "false" });
const storage = await import("../lib/storage/index.ts");
const { buildContextualLibraryReply } = await import("../lib/library/dialogue.ts");
const { getAiStatus } = await import("../lib/neiroclozer/ai-config.ts");
const aiStatus = getAiStatus();
console.log(JSON.stringify(aiStatus));
if (!aiStatus.configured) { process.exitCode = 2; throw new Error(aiStatus.configurationError); }
const expert = await storage.getActiveExpertProfile();
const lead = await storage.createLead({ expertProfileId: expert.id, telegramUserId: 989, telegramChatId: 989, telegramUsername: null, firstName: "Synthetic", lastName: null,
  source: "test", status: "active", currentStage: "ecosystem_menu", matchedOffer: null, lastUserMessage: null, warmthLevel: "cold" });
const replies = [];
for (const question of ["Я выбираю между текущей работой и новым предложением. Боюсь ошибиться. С чего начать?", "А если я уже выписал факты, но всё равно страшно?"]) {
  await storage.insertMessage({ leadId: lead.id, expertProfileId: expert.id, direction: "incoming", channel: "telegram", telegramMessageId: replies.length + 1, text: question, messageType: "user" });
  const response = await buildContextualLibraryReply(lead.id, question);
  if (response.text.includes("не получилось подготовить ответ")) {
    console.error("Live dialogue check blocked by provider/response failure. No Telegram messages or production writes occurred.");
    process.exitCode = 2;
    break;
  }
  replies.push({ question, answer: response.text, suggested: response.suggestedMaterials.map(material => material.title) });
  await storage.insertMessage({ leadId: lead.id, expertProfileId: expert.id, direction: "outgoing", channel: "telegram", telegramMessageId: replies.length + 10, text: response.text, messageType: "ai_reply" });
}
if (replies.length === 2) {
  assert.notEqual(replies[0].answer, replies[1].answer);
  assert.ok(replies[0].suggested.length > 0, "The decision-making request should produce a material recommendation");
}
console.log(JSON.stringify({ source: "configured AI; synthetic local-only history", replies }, null, 2));
