import { createHash } from "node:crypto";
import express from "express";
import type { NextFunction, Request, Response } from "express";
import { beforeEach, describe, expect, it, vi } from "vitest";

const TOKEN = "customer-currency-test-token-long-enough-1234567890";
const TENANT_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const TENANT_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const PRINCIPAL_ID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const CUSTOMER_ID = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";

vi.mock("../../src/modules/integration-auth/repositories/integration-principal.repository.js", () => ({
  integrationPrincipalRepository: { findByCode: vi.fn() },
}));
vi.mock("../../src/modules/tenants/repositories/tenant.repository.js", () => ({
  tenantRepository: { findActiveById: vi.fn() },
}));
vi.mock("../../src/modules/customers/services/customer.service.js", () => ({
  CustomerServiceError: class CustomerServiceError extends Error {
    constructor(readonly code: string, message: string) { super(message); }
  },
  customerService: { create: vi.fn(), list: vi.fn(), findById: vi.fn() },
}));
vi.mock("../../src/modules/currencies/repositories/currency.repository.js", () => ({
  currencyRepository: { listActive: vi.fn(), findActiveByCode: vi.fn() },
}));

import { integrationPrincipalRepository } from "../../src/modules/integration-auth/repositories/integration-principal.repository.js";
import { tenantRepository } from "../../src/modules/tenants/repositories/tenant.repository.js";
import { customerService, CustomerServiceError } from "../../src/modules/customers/services/customer.service.js";
import { customerRouter } from "../../src/modules/customers/routes/customer.routes.js";
import { currencyRepository } from "../../src/modules/currencies/repositories/currency.repository.js";
import { currencyRouter } from "../../src/modules/currencies/routes/currency.routes.js";

function principal(overrides: Record<string, unknown> = {}) {
  return {
    id: PRINCIPAL_ID,
    principal_code: "ci-integration",
    display_name: "CI integration",
    credential_hash: createHash("sha256").update(TOKEN).digest("hex"),
    allowed_scopes: ["customer:read", "customer:write", "currency:read"],
    allowed_tenant_ids: [TENANT_A],
    status: "ACTIVE",
    ...overrides,
  };
}

function app() {
  const server = express();
  server.use(express.json());
  server.use("/customers", customerRouter);
  server.use("/currencies", currencyRouter);
  server.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
    res.status(500).json({ error: { code: "INTERNAL_ERROR" } });
  });
  return server;
}

function authHeaders(tenantId = TENANT_A): Record<string, string> {
  return {
    "x-finance-client-id": "ci-integration",
    authorization: `Bearer ${TOKEN}`,
    "x-finance-tenant-id": tenantId,
  };
}

async function request(
  server: ReturnType<typeof express>,
  path: string,
  init: RequestInit = {},
  headers: Record<string, string> = authHeaders(),
) {
  const listener = await new Promise<ReturnType<typeof import("node:http").createServer>>((resolve) => {
    const httpServer = server.listen(0, "127.0.0.1", () => resolve(httpServer));
  });
  const address = listener.address();
  if (!address || typeof address === "string") throw new Error("Test server did not bind a TCP port");
  try {
    const response = await fetch(`http://127.0.0.1:${address.port}${path}`, {
      ...init,
      headers: { ...headers, ...(init.headers as Record<string, string> | undefined) },
    });
    return { status: response.status, body: await response.json() as unknown };
  } finally {
    await new Promise<void>((resolve, reject) => listener.close((error) => error ? reject(error) : resolve()));
  }
}

const validCustomer = {
  customerCode: "CUST_001",
  customerType: "BUSINESS",
  legalName: "Client Integration",
  countryCode: "BJ",
  defaultCurrency: "XOF",
  metadata: { source: "test" },
};

describe("customer and currency API routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(integrationPrincipalRepository.findByCode).mockResolvedValue(principal() as never);
    vi.mocked(tenantRepository.findActiveById).mockResolvedValue({
      id: TENANT_A, tenant_code: "ITEST_A", legal_name: "Integration Tenant A", status: "ACTIVE",
    });
  });

  it("requires service credentials for customer routes", async () => {
    const response = await request(app(), "/customers", { method: "GET" }, {});
    expect(response.status).toBe(401);
    expect(response.body).toMatchObject({ error: { code: "UNAUTHENTICATED" } });
    expect(customerService.list).not.toHaveBeenCalled();
  });

  it("requires the customer read scope and denies an ungranted tenant", async () => {
    vi.mocked(integrationPrincipalRepository.findByCode).mockResolvedValue(
      principal({ allowed_scopes: ["customer:write"] }) as never,
    );
    const missingScope = await request(app(), "/customers");
    expect(missingScope.status).toBe(403);
    expect(missingScope.body).toMatchObject({ error: { code: "INSUFFICIENT_SCOPE" } });

    vi.mocked(integrationPrincipalRepository.findByCode).mockResolvedValue(principal() as never);
    const foreignTenant = await request(app(), "/customers", {}, authHeaders(TENANT_B));
    expect(foreignTenant.status).toBe(403);
    expect(foreignTenant.body).toMatchObject({ error: { code: "TENANT_ACCESS_DENIED" } });
  });

  it("validates customer creation input and returns created data with correlation ID", async () => {
    const invalid = await request(app(), "/customers", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...validCustomer, total: "100" }),
    });
    expect(invalid.status).toBe(400);
    expect(invalid.body).toMatchObject({ error: { code: "INVALID_REQUEST" } });
    expect(customerService.create).not.toHaveBeenCalled();

    vi.mocked(customerService.create).mockResolvedValue({ id: CUSTOMER_ID, customerCode: "CUST_001" } as never);
    const created = await request(app(), "/customers", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(validCustomer),
    });
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({
      data: { customer: { id: CUSTOMER_ID, customerCode: "CUST_001" }, correlationId: expect.any(String) },
    });
    expect(customerService.create).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: TENANT_A, principal: { id: PRINCIPAL_ID } }),
      expect.objectContaining({ customerCode: "CUST_001" }),
    );
  });

  it("returns customers with explicit page metadata and rejects invalid list queries", async () => {
    vi.mocked(customerService.list).mockResolvedValue([
      { id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd", customerCode: "A" },
      { id: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee", customerCode: "B" },
      { id: "ffffffff-ffff-4fff-8fff-ffffffffffff", customerCode: "C" },
    ] as never);
    const page = await request(app(), "/customers?limit=2&q=Integration");
    expect(page.status).toBe(200);
    expect(page.body).toMatchObject({
      data: {
        customers: [{ customerCode: "A" }, { customerCode: "B" }],
        page: { limit: 2, hasMore: true, nextCursor: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee" },
      },
    });
    expect(customerService.list).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: TENANT_A }),
      expect.objectContaining({ limit: 2, q: "Integration" }),
    );

    const invalid = await request(app(), "/customers?limit=1000&unexpected=1");
    expect(invalid.status).toBe(400);
    expect(invalid.body).toMatchObject({ error: { code: "INVALID_QUERY" } });
  });

  it("uses tenant-scoped customer detail and validates identifiers", async () => {
    const invalid = await request(app(), "/customers/not-a-uuid");
    expect(invalid.status).toBe(400);
    expect(invalid.body).toMatchObject({ error: { code: "INVALID_CUSTOMER_ID" } });
    expect(customerService.findById).not.toHaveBeenCalled();

    vi.mocked(customerService.findById).mockResolvedValue({ id: CUSTOMER_ID } as never);
    const found = await request(app(), `/customers/${CUSTOMER_ID}`);
    expect(found.status).toBe(200);
    expect(found.body).toMatchObject({ data: { customer: { id: CUSTOMER_ID } } });
    expect(customerService.findById).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: TENANT_A }),
      CUSTOMER_ID,
    );
  });

  it("returns only active currencies and protects the endpoint with its scope", async () => {
    vi.mocked(currencyRepository.listActive).mockResolvedValue([
      { code: "XOF", name: "West African CFA franc", minorUnit: 0, isActive: true, source: "ISO_4217" },
    ]);
    const response = await request(app(), "/currencies");
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      data: { currencies: [{ code: "XOF", minorUnit: 0, isActive: true }], count: 1 },
    });
    expect(currencyRepository.listActive).toHaveBeenCalledOnce();

    vi.mocked(integrationPrincipalRepository.findByCode).mockResolvedValue(
      principal({ allowed_scopes: ["customer:read"] }) as never,
    );
    const denied = await request(app(), "/currencies");
    expect(denied.status).toBe(403);
    expect(denied.body).toMatchObject({ error: { code: "INSUFFICIENT_SCOPE" } });
  });

  it("maps customer uniqueness errors to conflict", async () => {
    vi.mocked(customerService.create).mockRejectedValue(
      new CustomerServiceError("CUSTOMER_CODE_CONFLICT", "A customer with this code already exists."),
    );
    const response = await request(app(), "/customers", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(validCustomer),
    });
    expect(response.status).toBe(409);
    expect(response.body).toMatchObject({ error: { code: "CUSTOMER_CODE_CONFLICT" } });
  });
});
