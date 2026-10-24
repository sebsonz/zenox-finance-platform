import { describe, expect, it, vi } from "vitest";
import {
  SupabaseTokenVerificationError,
  verifySupabaseAccessToken,
} from "../../src/modules/user-auth/services/supabase-user-verifier.service.js";

const supabaseUrl = "https://qsmairsmgfnlmiltvgvn.supabase.co";
const anonKey = "test-public-anon-key-value-long-enough";
const token = "a".repeat(40);
const userId = "58a1b7f4-29f3-4ed4-8c0f-3c4d5e6f7081";

describe("Supabase access token verifier", () => {
  it("returns only the verified user identity from Auth", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({
        id: userId,
        email: "user@example.test",
        app_metadata: { role: "service_role" },
        user_metadata: { tenant_id: "attacker-controlled" },
      }), { status: 200, headers: { "content-type": "application/json" } }),
    );

    await expect(verifySupabaseAccessToken({
      supabaseUrl, anonKey, accessToken: token, fetchImpl,
    })).resolves.toEqual({ id: userId, email: "user@example.test" });

    expect(fetchImpl).toHaveBeenCalledWith(
      new URL("/auth/v1/user", supabaseUrl),
      expect.objectContaining({
        method: "GET",
        headers: {
          apikey: anonKey,
          authorization: `Bearer ${token}`,
          accept: "application/json",
        },
      }),
    );
  });

  it("returns the authoritative email confirmation timestamp from Auth", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({
        id: userId,
        email: "verified@example.test",
        email_confirmed_at: "2026-10-20T10:00:00.000Z",
      }), { status: 200, headers: { "content-type": "application/json" } }),
    );
    await expect(verifySupabaseAccessToken({
      supabaseUrl, anonKey, accessToken: token, fetchImpl,
    })).resolves.toEqual({
      id: userId,
      email: "verified@example.test",
      emailConfirmedAt: "2026-10-20T10:00:00.000Z",
    });
  });

  it("rejects invalid and expired access tokens", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(new Response("{}", { status: 401 }));
    await expect(verifySupabaseAccessToken({
      supabaseUrl, anonKey, accessToken: token, fetchImpl,
    })).rejects.toMatchObject({ code: "INVALID_TOKEN" });
  });

  it("fails closed when Auth returns a malformed user identity", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({ id: "not-a-uuid" }), { status: 200 }),
    );
    await expect(verifySupabaseAccessToken({
      supabaseUrl, anonKey, accessToken: token, fetchImpl,
    })).rejects.toMatchObject({ code: "AUTH_PROVIDER_UNAVAILABLE" });
  });

  it("rejects non-HTTPS remote Supabase URLs", async () => {
    await expect(verifySupabaseAccessToken({
      supabaseUrl: "http://example.com", anonKey, accessToken: token,
      fetchImpl: vi.fn<typeof fetch>(),
    })).rejects.toBeInstanceOf(SupabaseTokenVerificationError);
  });

  it("does not expose user metadata as trusted authorization claims", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({
        id: userId,
        user_metadata: { role: "OWNER", tenant_id: "any-tenant" },
      }), { status: 200 }),
    );
    const verified = await verifySupabaseAccessToken({
      supabaseUrl, anonKey, accessToken: token, fetchImpl,
    });
    expect(verified).toEqual({ id: userId });
    expect(verified).not.toHaveProperty("user_metadata");
    expect(verified).not.toHaveProperty("role");
    expect(verified).not.toHaveProperty("tenant_id");
  });
});
