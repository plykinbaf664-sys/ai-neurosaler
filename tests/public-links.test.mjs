import "./register-typescript.mjs";
import assert from "node:assert/strict";
import { test, beforeEach, after } from "node:test";
import { getPublicBaseUrl, getMiniAppUrl } from "../lib/public-links.ts";

const keys = ["PUBLIC_BASE_URL", "NEXT_PUBLIC_APP_URL", "TELEGRAM_WEBHOOK_BASE_URL", "VERCEL_ENV", "VERCEL_PROJECT_PRODUCTION_URL"];
const saved = Object.fromEntries(keys.map(key => [key, process.env[key]]));
beforeEach(() => { for (const key of keys) delete process.env[key]; });
after(() => { for (const key of keys) { if (saved[key] === undefined) delete process.env[key]; else process.env[key] = saved[key]; } });

test("permanent public URL wins over an offline webhook tunnel", () => {
  process.env.PUBLIC_BASE_URL = "https://app.example/";
  process.env.TELEGRAM_WEBHOOK_BASE_URL = "https://old.ngrok-free.app/api/telegram/webhook";
  assert.equal(getMiniAppUrl(getPublicBaseUrl(new Request("https://deploy.example/api/telegram/webhook"))), "https://app.example/journey");
});

test("production ignores stale tunnels in every app URL setting and uses the stable Vercel domain", () => {
  process.env.VERCEL_ENV = "production";
  process.env.VERCEL_PROJECT_PRODUCTION_URL = "stable.vercel.app";
  process.env.PUBLIC_BASE_URL = "https://old.ngrok-free.app";
  process.env.NEXT_PUBLIC_APP_URL = "https://old.ngrok.io";
  process.env.TELEGRAM_WEBHOOK_BASE_URL = "https://old.ngrok.app";
  assert.equal(getPublicBaseUrl(new Request("https://deployment-hash.vercel.app/api/telegram/webhook")), "https://stable.vercel.app");
});

test("current request repairs legacy webhook configuration even without Vercel system variables", () => {
  process.env.TELEGRAM_WEBHOOK_BASE_URL = "https://old.ngrok-free.app";
  assert.equal(getPublicBaseUrl(new Request("https://current.example/api/telegram/webhook")), "https://current.example");
});

test("production falls back to the live request when system domain is unavailable", () => {
  process.env.VERCEL_ENV = "production";
  process.env.PUBLIC_BASE_URL = "http://localhost:3000";
  process.env.NEXT_PUBLIC_APP_URL = "https://old.ngrok-free.dev";
  assert.equal(getPublicBaseUrl(new Request("https://current.example/api/journey")), "https://current.example");
  assert.throws(() => getPublicBaseUrl(), /permanent HTTPS/);
});

test("custom domains, proxy origins and intentional local tunnels retain support", () => {
  process.env.VERCEL_ENV = "preview";
  process.env.VERCEL_PROJECT_PRODUCTION_URL = "production.vercel.app";
  assert.equal(getPublicBaseUrl(new Request("https://preview.vercel.app/api/journey")), "https://preview.vercel.app");
  assert.equal(getPublicBaseUrl(new Request("http://localhost:3000", { headers: { "x-forwarded-host": "custom.example", "x-forwarded-proto": "https" } })), "https://custom.example");
  process.env.PUBLIC_BASE_URL = "https://intentional.ngrok-free.app/api/telegram/webhook/";
  assert.equal(getMiniAppUrl(getPublicBaseUrl()), "https://intentional.ngrok-free.app/journey");
  delete process.env.PUBLIC_BASE_URL;
  assert.equal(getPublicBaseUrl(), "http://localhost:3000");
  assert.equal(getMiniAppUrl(getPublicBaseUrl()), null);
});

test("legacy webhook URL remains a path-stripped fallback for scripts without a request", () => {
  process.env.TELEGRAM_WEBHOOK_BASE_URL = " https://legacy.example/api/telegram/webhook/ ";
  assert.equal(getPublicBaseUrl(), "https://legacy.example");
});
