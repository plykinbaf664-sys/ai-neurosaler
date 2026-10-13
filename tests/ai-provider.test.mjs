import "./register-typescript.mjs";
import assert from "node:assert/strict";
import { test, beforeEach, after } from "node:test";
const { getAiConfig, getAiStatus } = await import("../lib/neiroclozer/ai-config.ts");
const { generateAiText, generateNeiroReply, summarizeAiFailure } = await import("../lib/neiroclozer/generate-reply.ts");
const originalFetch = globalThis.fetch;
const envKeys = ["AI_PROVIDER", "QWEN_API_KEY", "QWEN_BASE_URL", "QWEN_MODEL", "ANTHROPIC_API_KEY", "ANTHROPIC_MODEL", "STORAGE_DRIVER", "LOCAL_DATA_MODE"];
const originalEnv = Object.fromEntries(envKeys.map(key => [key, process.env[key]]));
let calls;
let response;
beforeEach(() => {
  Object.assign(process.env, { AI_PROVIDER: "qwen", QWEN_API_KEY: "private-qwen-key", QWEN_BASE_URL: "https://workspace.ap-southeast-1.maas.aliyuncs.com/compatible-mode/v1/",
    QWEN_MODEL: "qwen-plus", ANTHROPIC_API_KEY: "private-anthropic-key", ANTHROPIC_MODEL: "test-claude", STORAGE_DRIVER: "local", LOCAL_DATA_MODE: "memory" });
  calls = [];
  response = () => Response.json({ choices: [{ finish_reason: "stop", message: { content: "  Ответ Qwen  ", reasoning_content: "Never display this" } }] });
  globalThis.fetch = async (url, init) => { calls.push({ url, ...init, body: JSON.parse(init.body) }); return response(); };
});
after(() => {
  globalThis.fetch = originalFetch;
  for (const [key, value] of Object.entries(originalEnv)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
});

test("Qwen sends one bounded request with its own key/model and returns only final text", async () => {
  assert.equal(await generateNeiroReply("Привет"), "Ответ Qwen");
  assert.equal(calls.length, 1);
  const call = calls[0];
  assert.equal(call.url, "https://workspace.ap-southeast-1.maas.aliyuncs.com/compatible-mode/v1/chat/completions");
  assert.equal(call.headers.Authorization, "Bearer private-qwen-key");
  assert.equal(call.headers["x-api-key"], undefined);
  assert.equal(call.body.model, "qwen-plus");
  assert.equal(call.body.max_tokens, 900);
  assert.equal(call.body.enable_thinking, false);
  assert.equal(call.body.stream, false);
  assert.equal(call.body.response_format, undefined);
  assert.deepEqual(call.body.messages, [{ role: "user", content: "Привет" }]);
  assert.ok(call.signal instanceof AbortSignal);
  assert.equal(call.cache, "no-store");
  assert.equal(call.redirect, "error");
});

test("Qwen accepts a copied full endpoint and supports custom models and structured journey output", async () => {
  process.env.QWEN_BASE_URL = "https://qwen.test/v1/chat/completions/";
  process.env.QWEN_MODEL = " qwen-plus-custom ";
  response = () => Response.json({ choices: [{ message: { content: '{"reply":"Привет","materialIds":[]}' } }] });
  const result = await generateAiText("Return JSON", 1000, { json: true });
  assert.equal(JSON.parse(result).reply, "Привет");
  assert.equal(calls[0].url, "https://qwen.test/v1/chat/completions");
  assert.equal(calls[0].body.model, "qwen-plus-custom");
  assert.equal(calls[0].body.max_tokens, 1000);
  assert.deepEqual(calls[0].body.response_format, { type: "json_object" });
});

test("legacy Anthropic remains the default when no provider is selected", async () => {
  delete process.env.AI_PROVIDER;
  response = () => Response.json({ content: [{ type: "text", text: "Старый провайдер" }] });
  assert.equal(await generateAiText("JSON prompt", 1500, { json: true }), "Старый провайдер");
  assert.equal(calls[0].url, "https://api.anthropic.com/v1/messages");
  assert.equal(calls[0].headers["x-api-key"], "private-anthropic-key");
  assert.equal(calls[0].headers.Authorization, undefined);
  assert.equal(calls[0].body.enable_thinking, undefined);
  assert.equal(calls[0].body.response_format, undefined);
  assert.equal(calls[0].body.max_tokens, 1500);
});

test("missing Qwen settings fail before network access, with no fallback to Anthropic", async () => {
  delete process.env.QWEN_API_KEY;
  assert.equal(getAiStatus().configured, false);
  await assert.rejects(generateAiText("hello"), /QWEN_API_KEY/);
  process.env.QWEN_API_KEY = "private-qwen-key";
  delete process.env.QWEN_BASE_URL;
  await assert.rejects(generateAiText("hello"), /QWEN_BASE_URL/);
  process.env.AI_PROVIDER = "typo-provider";
  assert.equal(getAiStatus().provider, null);
  await assert.rejects(generateAiText("hello"), /AI_PROVIDER/);
  assert.equal(calls.length, 0);
});

test("invalid or placeholder endpoints are rejected without exposing their contents", () => {
  for (const url of ["not-a-url", "http://qwen.test/v1", "https://user:secret@qwen.test/v1", "https://qwen.test/v1?key=secret", "https://qwen.test/v1#secret", "https://{WorkspaceId}.example/v1"]) {
    process.env.QWEN_BASE_URL = url;
    assert.throws(getAiConfig);
    const status = getAiStatus();
    assert.equal(status.configured, false);
    assert.ok(!JSON.stringify(status).includes("secret"));
    assert.ok(!JSON.stringify(status).includes("private-qwen-key"));
  }
});

test("provider errors are classified without raw prompts/keys, retries or provider switching", async () => {
  for (const [status, code, reason] of [[401, "invalid_api_key", "authentication_failed"], [403, "AccessDenied", "access_denied"], [400, "Arrearage", "insufficient_credits"],
    [429, "RateLimit", "rate_limited"], [404, "ModelNotFound", "model_or_endpoint_not_found"], [500, "InternalError", "upstream_error"]]) {
    response = () => Response.json({ error: { code, message: "private-qwen-key PRIVATE PROMPT" } }, { status, headers: { "x-request-id": "request-123" } });
    await assert.rejects(generateAiText("PRIVATE PROMPT"), error => {
      assert.deepEqual(summarizeAiFailure(error), { provider: "qwen", status, reason, requestId: "request-123" });
      assert.ok(!error.message.includes("private-qwen-key"));
      return true;
    });
  }
  assert.equal(calls.length, 6);
});

test("empty, thinking-only and truncated answers never become user-facing replies", async () => {
  for (const message of [{ content: " " }, { content: null, reasoning_content: "reasoning only" }]) {
    response = () => Response.json({ choices: [{ message }] });
    await assert.rejects(generateAiText("hello"), error => error.reason === "empty_response");
  }
  response = () => Response.json({ choices: [{ finish_reason: "length", message: { content: '{"partial"' } }] });
  await assert.rejects(generateAiText("JSON"), error => error.reason === "response_truncated");
  response = () => { throw new DOMException("Timed out", "TimeoutError"); };
  await assert.rejects(generateAiText("hello"), error => summarizeAiFailure(error).reason === "TimeoutError");
  assert.equal(calls.length, 4);
});

test("status checks the selected Qwen configuration without sending AI requests or exposing credentials", async () => {
  const { GET } = await import("../app/api/status/route.ts");
  const data = await (await GET()).json();
  assert.equal(data.integrations.ai, true);
  assert.equal(data.ai.provider, "qwen");
  assert.equal(data.ai.model, "qwen-plus");
  assert.ok(!JSON.stringify(data).includes("private-qwen-key"));
  assert.ok(!JSON.stringify(data).includes("maas.aliyuncs.com"));
  delete process.env.QWEN_API_KEY;
  assert.equal((await (await GET()).json()).integrations.ai, false);
  assert.equal(calls.length, 0);
});
