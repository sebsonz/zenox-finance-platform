import express from "express";
import type { NextFunction, Request, Response } from "express";
import { beforeEach, describe, expect, it, vi } from "vitest";

const TENANT_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const OPERATOR_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const ISSUER = "https://example.supabase.co";

const mocks = vi.hoisted(() => ({
  user: null as null | {
    id: string;
    issuer: string;
    emailConfirmedAt: string | null;
  },
  apply: vi.fn(),
}));

vi.mock("../../src/middleware/require-user-auth.js", () => ({
  requireUserAuth: () =>
    (req: Request, res: Response, next: NextFunction) => {
      if (!mocks.user) {
        res.status(401).json({
          error: { code: "UNAUTHENTICATED" },
        });
        return;
      }

      req.financeUser = mocks.user;
      next();
    },
}));

vi.mock(
  "../../src/modules/platform-admin/repositories/organization-lifecycle.repository.js",
  () => ({
    organizationLifecycleRepository: {
      apply: mocks.apply,
    },
  }),
);

import {
  platformOrganizationLifecycleRouter,
} from "../../src/modules/platform-admin/routes/organization-lifecycle.routes.js";

function createApp() {
  const server = express();
  server.use(express.json());
  server.use("/platform", platformOrganizationLifecycleRouter);

  server.use(
    (error: unknown, _req: Request, res: Response, _next: NextFunction) => {
      res.status(500).json({
        error: { code: "INTERNAL_ERROR" },
      });
    },
  );

  return server;
}

async function request(
  path: string,
  body?: unknown,
  origin?: string | null,
) {
  const server = createApp();

  const listener = await new Promise<
    ReturnType<typeof import("node:http").createServer>
  >((resolve) => {
    const instance = server.listen(0, "127.0.0.1", () =>
      resolve(instance),
    );
  });

  const address = listener.address();

  if (!address || typeof address === "string") {
    throw new Error("Test server did not bind a TCP port");
  }

  const baseUrl = `http://127.0.0.1:${address.port}`;
  const headers: Record<string, string> = {};

  if (origin === undefined) {
    headers["origin"] = baseUrl;
  } else if (origin !== null) {
    headers["origin"] = origin;
  }

  if (body !== undefined) {
    headers["content-type"] = "application/json";
  }

  try {
    const response = await fetch(`${baseUrl}${path}`, {
      method: "PATCH",
      headers,
      ...(body === undefined
        ? {}
        : { body: JSON.stringify(body) }),
    });

    return {
      status: response.status,
      body: await response.json() as unknown,
      headers: response.headers,
    };
  } finally {
    await new Promise<void>((resolve, reject) =>
      listener.close((error) =>
        error ? reject(error) : resolve(),
      ),
    );
  }
}

const validBody = {
  action: "SUSPEND",
  reason: "Suspension demandée pour vérification administrative",
};

const validRow = {
  tenant_id: TENANT_ID,
  status: "SUSPENDED" as const,
  updated_at: new Date("2026-11-21T12:00:00.000Z"),
};

describe("organization lifecycle routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mocks.user = {
      id: OPERATOR_ID,
      issuer: ISSUER,
      emailConfirmedAt: "2026-11-01T10:00:00.000Z",
    };
  });

  it("rejects a missing authenticated user", async () => {
    mocks.user = null;

    const response = await request(
      `/platform/organizations/${TENANT_ID}/status`,
      validBody,
    );

    expect(response.status).toBe(401);
    expect(mocks.apply).not.toHaveBeenCalled();
  });

  it("requires a confirmed email", async () => {
    mocks.user = {
      id: OPERATOR_ID,
      issuer: ISSUER,
      emailConfirmedAt: null,
    };

    const response = await request(
      `/platform/organizations/${TENANT_ID}/status`,
      validBody,
    );

    expect(response.status).toBe(403);
    expect(response.body).toMatchObject({
      error: { code: "EMAIL_CONFIRMATION_REQUIRED" },
    });
    expect(mocks.apply).not.toHaveBeenCalled();
  });

  it("rejects a missing or foreign origin", async () => {
    const missingOrigin = await request(
      `/platform/organizations/${TENANT_ID}/status`,
      validBody,
      null,
    );

    const foreignOrigin = await request(
      `/platform/organizations/${TENANT_ID}/status`,
      validBody,
      "https://attacker.example",
    );

    expect(missingOrigin.status).toBe(403);
    expect(foreignOrigin.status).toBe(403);
    expect(mocks.apply).not.toHaveBeenCalled();
  });

  it("rejects an invalid tenant UUID", async () => {
    const response = await request(
      "/platform/organizations/not-a-uuid/status",
      validBody,
    );

    expect(response.status).toBe(400);
    expect(response.body).toMatchObject({
      error: { code: "VALIDATION_ERROR" },
    });
    expect(mocks.apply).not.toHaveBeenCalled();
  });

  it("rejects an invalid action, short reason and unknown fields", async () => {
    const invalidAction = await request(
      `/platform/organizations/${TENANT_ID}/status`,
      { action: "DELETE", reason: "Motif suffisamment long" },
    );

    const shortReason = await request(
      `/platform/organizations/${TENANT_ID}/status`,
      { action: "SUSPEND", reason: "Court" },
    );

    const unknownField = await request(
      `/platform/organizations/${TENANT_ID}/status`,
      { ...validBody, unexpected: true },
    );

    expect(invalidAction.status).toBe(400);
    expect(shortReason.status).toBe(400);
    expect(unknownField.status).toBe(400);
    expect(mocks.apply).not.toHaveBeenCalled();
  });

  it("suspends an organization and returns its authoritative status", async () => {
    mocks.apply.mockResolvedValue(validRow);

    const response = await request(
      `/platform/organizations/${TENANT_ID}/status`,
      validBody,
    );

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      data: {
        organization: {
          id: TENANT_ID,
          status: "SUSPENDED",
          updatedAt: validRow.updated_at.toISOString(),
        },
      },
    });

    expect(response.headers.get("cache-control")).toBe("no-store");

    expect(mocks.apply).toHaveBeenCalledWith({
      operatorIssuer: ISSUER,
      operatorSubject: OPERATOR_ID,
      tenantId: TENANT_ID,
      action: "SUSPEND",
      reason: validBody.reason,
      correlationId: "unknown",
    });
  });

  it("reactivates an organization", async () => {
    mocks.apply.mockResolvedValue({
      ...validRow,
      status: "ACTIVE",
    });

    const response = await request(
      `/platform/organizations/${TENANT_ID}/status`,
      {
        action: "REACTIVATE",
        reason: "Réactivation autorisée après vérification",
      },
    );

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      data: {
        organization: {
          id: TENANT_ID,
          status: "ACTIVE",
        },
      },
    });

    expect(mocks.apply).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "REACTIVATE",
        tenantId: TENANT_ID,
      }),
    );
  });

  it.each([
    ["42501", 403, "PLATFORM_OPERATOR_REQUIRED"],
    ["P0002", 404, "ORGANIZATION_NOT_FOUND"],
    ["P0001", 409, "ORGANIZATION_STATUS_TRANSITION_NOT_ALLOWED"],
    ["22023", 422, "INVALID_ORGANIZATION_ACTION"],
  ])(
    "maps database error %s to HTTP %i",
    async (databaseCode, expectedStatus, expectedCode) => {
      mocks.apply.mockRejectedValue({ code: databaseCode });

      const response = await request(
        `/platform/organizations/${TENANT_ID}/status`,
        validBody,
      );

      expect(response.status).toBe(expectedStatus);
      expect(response.body).toMatchObject({
        error: { code: expectedCode },
      });
    },
  );

  it("forwards unexpected repository errors to the error middleware", async () => {
    mocks.apply.mockRejectedValue(new Error("Unexpected failure"));

    const response = await request(
      `/platform/organizations/${TENANT_ID}/status`,
      validBody,
    );

    expect(response.status).toBe(500);
    expect(response.body).toMatchObject({
      error: { code: "INTERNAL_ERROR" },
    });
  });
});
