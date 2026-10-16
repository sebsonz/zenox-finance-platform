import { createHash } from "node:crypto";
import express from "express";
import type { NextFunction, Request, Response } from "express";
import { beforeEach, describe, expect, it, vi } from "vitest";

const TOKEN = "route-test-service-token-long-enough-for-auth-123456";
const TENANT_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const TENANT_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const PRINCIPAL_ID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

vi.mock("../../src/modules/integration-auth/repositories/integration-principal.repository.js", () => ({
  integrationPrincipalRepository: { findByCode: vi.fn() },
}));
vi.mock("../../src/modules/tenants/repositories/tenant.repository.js", () => ({
  tenantRepository: { findActiveById: vi.fn() },
}));
vi.mock("../../src/modules/tax/services/tax-calculation.service.js", () => ({
  TaxCalculationServiceError: class TaxCalculationServiceError extends Error {
    constructor(readonly code: string, message: string) { super(message); }
  },
  taxCalculationService: { calculateAndSnapshot: vi.fn() },
}));

import { integrationPrincipalRepository } from "../../src/modules/integration-auth/repositories/integration-principal.repository.js";
import { tenantRepository } from "../../src/modules/tenants/repositories/tenant.repository.js";
import { taxCalculationRouter } from "../../src/modules/tax/routes/tax-calculation.routes.js";
import { TaxCalculationServiceError, taxCalculationService } from "../../src/modules/tax/services/tax-calculation.service.js";

const validBody = {
  documentType: "INVOICE",
  documentId: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
  documentVersion: 1,
  taxDate: "2026-10-16",
  currencyCode: "XOF",
  jurisdictionId: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
  appliesTo: "GOODS",
  amount: "1000",
};

function principal(overrides: Record<string, unknown> = {}) {
  return {
    id: PRINCIPAL_ID,
    principal_code: "zenox-fret",
    display_name: "ZENOX FRET",
    credential_hash: createHash("sha256").update(TOKEN).digest("hex"),
    allowed_scopes: ["tax:snapshot:write"],
    allowed_tenant_ids: [TENANT_A],
    status: "ACTIVE",
    ...overrides,
  };
}

function app() {
  const server = express();
  server.use(express.json());
  server.use("/tax", taxCalculationRouter);
  server.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
    res.status(500).json({ error: { code: "INTERNAL_ERROR" } });
  });
  return server;
}

describe("POST /tax/calculate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(integrationPrincipalRepository.findByCode).mockResolvedValue(principal() as never);
    vi.mocked(tenantRepository.findActiveById).mockResolvedValue({
      id: TENANT_A,
      tenant_code: "ITEST_A",
      legal_name: "Integration tenant A",
      status: "ACTIVE",
    });
  });

  it("rejects requests without credentials before invoking the calculation service", async () => {
    const response = await fetchWithExpress(app(), "/tax/calculate", validBody);
    expect(response.status).toBe(401);
    expect(response.body).toMatchObject({ error: { code: "UNAUTHENTICATED" } });
    expect(taxCalculationService.calculateAndSnapshot).not.toHaveBeenCalled();
  });

  it("rejects callers without the required scope", async () => {
    vi.mocked(integrationPrincipalRepository.findByCode).mockResolvedValue(
      principal({ allowed_scopes: ["tax:snapshot:read"] }) as never,
    );
    const response = await fetchWithExpress(app(), "/tax/calculate", validBody, authHeaders());
    expect(response.status).toBe(403);
    expect(response.body).toMatchObject({ error: { code: "INSUFFICIENT_SCOPE" } });
    expect(taxCalculationService.calculateAndSnapshot).not.toHaveBeenCalled();
  });

  it("rejects a tenant outside the principal grant", async () => {
    const response = await fetchWithExpress(app(), "/tax/calculate", validBody, authHeaders(TENANT_B));
    expect(response.status).toBe(403);
    expect(response.body).toMatchObject({ error: { code: "TENANT_ACCESS_DENIED" } });
    expect(taxCalculationService.calculateAndSnapshot).not.toHaveBeenCalled();
  });

  it("rejects client-supplied calculation results", async () => {
    const response = await fetchWithExpress(app(), "/tax/calculate", {
      ...validBody, resultSnapshot: { grandTotal: "1.00" },
    }, authHeaders());
    expect(response.status).toBe(400);
    expect(response.body).toMatchObject({ error: { code: "INVALID_REQUEST" } });
    expect(taxCalculationService.calculateAndSnapshot).not.toHaveBeenCalled();
  });

  it("creates a server-calculated snapshot only after authentication and tenant verification", async () => {
    vi.mocked(taxCalculationService.calculateAndSnapshot).mockResolvedValue({ id: "snapshot-id" } as never);
    const response = await fetchWithExpress(app(), "/tax/calculate", validBody, authHeaders());
    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({ data: { snapshot: { id: "snapshot-id" } } });
    expect(taxCalculationService.calculateAndSnapshot).toHaveBeenCalledOnce();
    expect(vi.mocked(taxCalculationService.calculateAndSnapshot).mock.calls[0]?.[0]).toMatchObject({
      tenantId: TENANT_A,
      principal: { id: PRINCIPAL_ID, principalCode: "zenox-fret" },
    });
  });

  it("maps duplicate document versions to conflict", async () => {
    vi.mocked(taxCalculationService.calculateAndSnapshot).mockRejectedValue(
      new TaxCalculationServiceError("SNAPSHOT_ALREADY_EXISTS", "Snapshot exists"),
    );
    const response = await fetchWithExpress(app(), "/tax/calculate", validBody, authHeaders());
    expect(response.status).toBe(409);
    expect(response.body).toMatchObject({ error: { code: "SNAPSHOT_ALREADY_EXISTS" } });
  });
});

function authHeaders(tenantId = TENANT_A): Record<string, string> {
  return {
    "x-finance-client-id": "zenox-fret",
    authorization: `Bearer ${TOKEN}`,
    "x-finance-tenant-id": tenantId,
  };
}

async function fetchWithExpress(
  server: ReturnType<typeof express>,
  path: string,
  body: unknown,
  headers: Record<string, string> = {},
) {
  const listener = await new Promise<ReturnType<typeof import("node:http").createServer>>((resolve) => {
    const httpServer = server.listen(0, "127.0.0.1", () => resolve(httpServer));
  });
  const address = listener.address();
  if (!address || typeof address === "string") throw new Error("Test server did not bind a TCP port");
  try {
    const response = await fetch(`http://127.0.0.1:${address.port}${path}`, {
      method: "POST",
      headers: { "content-type": "application/json", ...headers },
      body: JSON.stringify(body),
    });
    return { status: response.status, body: await response.json() as unknown };
  } finally {
    await new Promise<void>((resolve, reject) => listener.close((error) => error ? reject(error) : resolve()));
  }
}
