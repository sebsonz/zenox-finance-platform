import express from "express";
import type { NextFunction, Request, Response } from "express";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../src/middleware/require-integration-auth.js", () => ({
  requireIntegrationAuth: () => (req: Request, _res: Response, next: NextFunction) => {
    req.financeContext = {
      principal: {
        id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
        principalCode: "zenox-fret",
        displayName: "ZENOX FRET",
        scopes: ["tax:snapshot:write"],
        allowedTenantIds: ["aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"],
      },
      tenantId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      correlationId: "corr-test",
    };
    next();
  },
}));
vi.mock("../../src/modules/tax/services/tax-calculation.service.js", () => ({
  TaxCalculationServiceError: class TaxCalculationServiceError extends Error {
    constructor(readonly code: string, message: string) { super(message); }
  },
  taxCalculationService: { calculateAndSnapshot: vi.fn() },
}));

import { taxCalculationRouter } from "../../src/modules/tax/routes/tax-calculation.routes.js";
import { taxCalculationService } from "../../src/modules/tax/services/tax-calculation.service.js";

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

function app() {
  const server = express();
  server.use(express.json());
  server.use("/tax", taxCalculationRouter);
  server.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
    res.status(500).json({ error: { code: "INTERNAL_ERROR" } });
  });
  return server;
}

async function request(body: unknown) {
  return app().request;
}

describe("POST /tax/calculate", () => {
  beforeEach(() => vi.clearAllMocks());

  it("rejects invalid payloads before calling the service", async () => {
    const response = await fetchWithExpress(app(), "/tax/calculate", { ...validBody, resultSnapshot: { total: 1 } });
    expect(response.status).toBe(400);
    expect(response.body).toMatchObject({ error: { code: "INVALID_REQUEST" } });
    expect(taxCalculationService.calculateAndSnapshot).not.toHaveBeenCalled();
  });

  it("creates a server-calculated snapshot", async () => {
    vi.mocked(taxCalculationService.calculateAndSnapshot).mockResolvedValue({ id: "snapshot-id" } as never);
    const response = await fetchWithExpress(app(), "/tax/calculate", validBody);
    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({ data: { snapshot: { id: "snapshot-id" }, correlationId: "corr-test" } });
    expect(taxCalculationService.calculateAndSnapshot).toHaveBeenCalledOnce();
  });

  it("maps duplicate document versions to conflict", async () => {
    const error = new (await import("../../src/modules/tax/services/tax-calculation.service.js")).TaxCalculationServiceError(
      "SNAPSHOT_ALREADY_EXISTS",
      "Snapshot exists",
    );
    vi.mocked(taxCalculationService.calculateAndSnapshot).mockRejectedValue(error);
    const response = await fetchWithExpress(app(), "/tax/calculate", validBody);
    expect(response.status).toBe(409);
    expect(response.body).toMatchObject({ error: { code: "SNAPSHOT_ALREADY_EXISTS" } });
  });
});

async function fetchWithExpress(server: ReturnType<typeof express>, path: string, body: unknown) {
  const listener = await new Promise<ReturnType<typeof import("node:http").createServer>>((resolve) => {
    const httpServer = server.listen(0, "127.0.0.1", () => resolve(httpServer));
  });
  const address = listener.address();
  if (!address || typeof address === "string") throw new Error("Test server did not bind a TCP port");
  try {
    const response = await fetch(`http://127.0.0.1:${address.port}${path}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    return { status: response.status, body: await response.json() as unknown };
  } finally {
    await new Promise<void>((resolve, reject) => listener.close((error) => error ? reject(error) : resolve()));
  }
}
