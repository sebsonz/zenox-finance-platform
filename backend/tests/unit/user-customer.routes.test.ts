import express from "express";
import type { NextFunction, Request, Response } from "express";
import { beforeEach, describe, expect, it, vi } from "vitest";

const TENANT_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const USER_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const USER_ISSUER = "https://identity.example.test";
const CUSTOMER_ID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

vi.mock("../../src/middleware/require-user-auth.js", () => ({
  requireUserAuth: () => (req: Request, _res: Response, next: NextFunction) => {
    req.financeUser = { id: USER_ID, issuer: USER_ISSUER, email: "user@example.test" };
    next();
  },
}));
vi.mock("../../src/modules/tenants/repositories/user-tenant-membership.repository.js", () => ({
  userTenantMembershipRepository: { findActiveMembership: vi.fn() },
}));
vi.mock("../../src/modules/tenants/services/user-tenant-permissions.service.js", () => ({
  assertActiveMembershipCan: vi.fn((membership: { status: string; role_code: string }, permission: string) => {
    if (membership.status !== "ACTIVE" || membership.role_code === "NO_CUSTOMER_ACCESS" || (permission === "customers:manage" && !["OWNER", "ADMIN", "FINANCE_MANAGER"].includes(membership.role_code))) {
      throw new Error("User is not authorized");
    }
  }),
}));
vi.mock("../../src/modules/tenants/repositories/tenant.repository.js", () => ({
  tenantRepository: { findActiveById: vi.fn() },
}));
vi.mock("../../src/modules/customers/services/customer.service.js", () => ({
  CustomerServiceError: class CustomerServiceError extends Error {
    constructor(readonly code: string, message: string) { super(message); }
  },
  customerService: { list: vi.fn(), findById: vi.fn(), create: vi.fn(), update: vi.fn(), archive: vi.fn() },
}));
vi.mock("../../src/modules/customers/services/customer-relations.service.js", () => ({
  CustomerRelationsServiceError: class CustomerRelationsServiceError extends Error {
    constructor(readonly code: string, message: string) { super(message); }
  },
  customerRelationsService: { listContacts: vi.fn(), listAddresses: vi.fn(), createContact: vi.fn(), updateContact: vi.fn(), archiveContact: vi.fn(), createAddress: vi.fn(), updateAddress: vi.fn(), archiveAddress: vi.fn() },
}));

import { userTenantMembershipRepository } from "../../src/modules/tenants/repositories/user-tenant-membership.repository.js";
import { assertActiveMembershipCan } from "../../src/modules/tenants/services/user-tenant-permissions.service.js";
import { tenantRepository } from "../../src/modules/tenants/repositories/tenant.repository.js";
import { customerService } from "../../src/modules/customers/services/customer.service.js";
import { customerRelationsService } from "../../src/modules/customers/services/customer-relations.service.js";
import { userCustomerRouter } from "../../src/modules/user-auth/routes/user-customer.routes.js";

function app() {
  const server = express();
  server.use(express.json());
  server.use("/user/tenants", userCustomerRouter);
  server.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
    res.status(500).json({ error: { code: "INTERNAL_ERROR" } });
  });
  return server;
}

async function get(server: ReturnType<typeof express>, path: string) {
  const listener = await new Promise<ReturnType<typeof import("node:http").createServer>>((resolve) => {
    const httpServer = server.listen(0, "127.0.0.1", () => resolve(httpServer));
  });
  const address = listener.address();
  if (!address || typeof address === "string") throw new Error("Test server did not bind a TCP port");
  try {
    const response = await fetch(`http://127.0.0.1:${address.port}${path}`);
    return { status: response.status, headers: response.headers, body: await response.json() as unknown };
  } finally {
    await new Promise<void>((resolve, reject) => listener.close((error) => error ? reject(error) : resolve()));
  }
}

const membership = (role_code = "VIEWER") => ({
  id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
  tenant_id: TENANT_ID,
  identity_issuer: USER_ISSUER,
  identity_subject: USER_ID,
  role_code,
  status: "ACTIVE" as const,
  activated_at: new Date("2026-10-16T00:00:00.000Z"),
  it("allows an active owner to create a customer with a server-derived actor context", async () => {
    vi.mocked(userTenantMembershipRepository.findActiveMembership).mockResolvedValue(membership("OWNER") as never);
    const server = app();
    const listener = await new Promise<ReturnType<typeof import("node:http").createServer>>((resolve) => {
      const httpServer = server.listen(0, "127.0.0.1", () => resolve(httpServer));
    });
    const address = listener.address();
    if (!address || typeof address === "string") throw new Error("Test server did not bind a TCP port");
    try {
      const response = await fetch(`http://127.0.0.1:${address.port}/user/tenants/${TENANT_ID}/customers`, {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ customerCode: "CUST-01", customerType: "BUSINESS", legalName: "Example Ltd", countryCode: "BJ" }),
      });
      expect(response.status).toBe(201);
      expect(customerService.create).toHaveBeenCalledWith(expect.objectContaining({
        tenantId: TENANT_ID,
        actor: { type: "USER", ref: `${USER_ISSUER}|${USER_ID}`, membershipId: expect.any(String), identityIssuer: USER_ISSUER, identitySubject: USER_ID },
      }), expect.objectContaining({ customerCode: "CUST-01" }));
    } finally {
      await new Promise<void>((resolve, reject) => listener.close((error) => error ? reject(error) : resolve()));
    }
  });

  it("denies customer writes to a viewer before invoking the domain service", async () => {
    const server = app();
    const listener = await new Promise<ReturnType<typeof import("node:http").createServer>>((resolve) => {
      const httpServer = server.listen(0, "127.0.0.1", () => resolve(httpServer));
    });
    const address = listener.address();
    if (!address || typeof address === "string") throw new Error("Test server did not bind a TCP port");
    try {
      const response = await fetch(`http://127.0.0.1:${address.port}/user/tenants/${TENANT_ID}/customers`, {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ customerCode: "CUST-01", customerType: "BUSINESS", legalName: "Example Ltd", countryCode: "BJ" }),
      });
      expect(response.status).toBe(403);
      expect(customerService.create).not.toHaveBeenCalled();
    } finally {
      await new Promise<void>((resolve, reject) => listener.close((error) => error ? reject(error) : resolve()));
    }
  });

});

describe("user customer read routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(userTenantMembershipRepository.findActiveMembership).mockResolvedValue(membership() as never);
    vi.mocked(tenantRepository.findActiveById).mockResolvedValue({
      id: TENANT_ID, tenant_code: "ZNX-000001", legal_name: "Test Tenant", status: "ACTIVE",
    });
    vi.mocked(customerService.list).mockResolvedValue([{ id: CUSTOMER_ID, legalName: "Example Ltd" }] as never);
    vi.mocked(customerService.findById).mockResolvedValue({ id: CUSTOMER_ID, legalName: "Example Ltd" } as never);
    vi.mocked(customerService.create).mockResolvedValue({ id: CUSTOMER_ID, customerCode: "CUST-01" } as never);
    vi.mocked(customerService.update).mockResolvedValue({ id: CUSTOMER_ID, customerCode: "CUST-01" } as never);
    vi.mocked(customerService.archive).mockResolvedValue({ id: CUSTOMER_ID, status: "ARCHIVED" } as never);
    vi.mocked(customerRelationsService.createContact).mockResolvedValue({ id: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee" } as never);
    vi.mocked(customerRelationsService.createAddress).mockResolvedValue({ id: "ffffffff-ffff-4fff-8fff-ffffffffffff" } as never);
    vi.mocked(customerRelationsService.listContacts).mockResolvedValue([] as never);
    vi.mocked(customerRelationsService.listAddresses).mockResolvedValue([] as never);
  });

  it("rejects invalid tenant IDs before membership lookup", async () => {
    const response = await get(app(), "/user/tenants/not-a-uuid/customers");
    expect(response.status).toBe(400);
    expect(response.body).toMatchObject({ error: { code: "INVALID_TENANT_ID" } });
    expect(userTenantMembershipRepository.findActiveMembership).not.toHaveBeenCalled();
  });

  it("denies users without active membership before reading customer data", async () => {
    vi.mocked(userTenantMembershipRepository.findActiveMembership).mockResolvedValue(null);
    const response = await get(app(), `/user/tenants/${TENANT_ID}/customers`);
    expect(response.status).toBe(403);
    expect(response.body).toMatchObject({ error: { code: "TENANT_ACCESS_DENIED" } });
    expect(customerService.list).not.toHaveBeenCalled();
  });

  it("checks the customer read permission before reading customer data", async () => {
    vi.mocked(userTenantMembershipRepository.findActiveMembership).mockResolvedValue(membership("NO_CUSTOMER_ACCESS") as never);
    const response = await get(app(), `/user/tenants/${TENANT_ID}/customers`);
    expect(response.status).toBe(403);
    expect(response.body).toMatchObject({ error: { code: "CUSTOMER_ACCESS_DENIED" } });
    expect(assertActiveMembershipCan).toHaveBeenCalledWith(expect.objectContaining({ role_code: "NO_CUSTOMER_ACCESS" }), "customers:read");
    expect(customerService.list).not.toHaveBeenCalled();
  });

  it("does not read customer data for an inactive tenant", async () => {
    vi.mocked(tenantRepository.findActiveById).mockResolvedValue(null);
    const response = await get(app(), `/user/tenants/${TENANT_ID}/customers`);
    expect(response.status).toBe(404);
    expect(response.body).toMatchObject({ error: { code: "TENANT_NOT_AVAILABLE" } });
    expect(customerService.list).not.toHaveBeenCalled();
  });

  it("returns bounded customer data with no-store and a verified tenant context", async () => {
    const response = await get(app(), `/user/tenants/${TENANT_ID}/customers?limit=10`);
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.body).toMatchObject({ data: { customers: [{ id: CUSTOMER_ID }], page: { limit: 10, hasMore: false } } });
    expect(customerService.list).toHaveBeenCalledWith(expect.objectContaining({ tenantId: TENANT_ID }), expect.objectContaining({ limit: 10 }));
  });

  it("rejects invalid customer identifiers and invalid query bounds", async () => {
    const invalidId = await get(app(), `/user/tenants/${TENANT_ID}/customers/not-a-uuid`);
    expect(invalidId.status).toBe(400);
    const invalidQuery = await get(app(), `/user/tenants/${TENANT_ID}/customers?limit=1000`);
    expect(invalidQuery.status).toBe(400);
    expect(customerService.findById).not.toHaveBeenCalled();
  });

  it("serves contacts and addresses only through the authorized tenant read context", async () => {
    const contacts = await get(app(), `/user/tenants/${TENANT_ID}/customers/${CUSTOMER_ID}/contacts`);
    const addresses = await get(app(), `/user/tenants/${TENANT_ID}/customers/${CUSTOMER_ID}/addresses`);
    expect(contacts.status).toBe(200);
    expect(addresses.status).toBe(200);
    expect(customerRelationsService.listContacts).toHaveBeenCalledWith(expect.objectContaining({ tenantId: TENANT_ID }), CUSTOMER_ID, expect.any(Object));
    expect(customerRelationsService.listAddresses).toHaveBeenCalledWith(expect.objectContaining({ tenantId: TENANT_ID }), CUSTOMER_ID, expect.any(Object));
  });
});
