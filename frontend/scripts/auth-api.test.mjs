import assert from "node:assert/strict";
import test from "node:test";
import { authConfig, exchangeSession, readData } from "../src/auth/auth-api.ts";

test("readData returns a successful data envelope", async () => {
  const value = await readData(new Response(JSON.stringify({ data: { id: "user-1" } })), "fallback");
  assert.deepEqual(value, { id: "user-1" });
});

test("readData surfaces API errors without leaking raw response details", async () => {
  await assert.rejects(
    readData(new Response(JSON.stringify({ error: { message: "Session expired" } }), { status: 401 }), "fallback"),
    /Session expired/,
  );
});

test("authConfig requests configuration without caching", async (context) => {
  const originalFetch = globalThis.fetch;
  context.after(() => { globalThis.fetch = originalFetch; });
  let observed: { url?: string; cache?: RequestCache } = {};
  globalThis.fetch = (async (input, init) => {
    observed = { url: String(input), cache: init?.cache };
    return new Response(JSON.stringify({ data: { supabaseUrl: "https://auth.example.test", supabaseAnonKey: "public-key" } }));
  }) as typeof fetch;

  assert.deepEqual(await authConfig(), {
    supabaseUrl: "https://auth.example.test",
    supabaseAnonKey: "public-key",
  });
  assert.deepEqual(observed, { url: "/api/v1/user/session/config", cache: "no-store" });
});

test("exchangeSession uses same-origin credentials and never stores the token in a URL", async (context) => {
  const originalFetch = globalThis.fetch;
  context.after(() => { globalThis.fetch = originalFetch; });
  let observed: { url?: string; method?: string; credentials?: RequestCredentials; body?: string } = {};
  globalThis.fetch = (async (input, init) => {
    observed = {
      url: String(input),
      method: init?.method,
      credentials: init?.credentials,
      body: String(init?.body),
    };
    return new Response(JSON.stringify({ data: { id: "user-1" } }));
  }) as typeof fetch;

  await exchangeSession("test-access-token");
  assert.deepEqual(observed, {
    url: "/api/v1/user/session",
    method: "POST",
    credentials: "same-origin",
    body: JSON.stringify({ accessToken: "test-access-token" }),
  });
});
