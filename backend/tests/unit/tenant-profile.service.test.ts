import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  withTenantTransaction: vi.fn(),
  getProfile: vi.fn(),
  upsertProfile: vi.fn(),
  listActiveAddresses: vi.fn(),
  createAddress: vi.fn(),
  recordAudit: vi.fn(),
  client: { query: vi.fn() },
}));

vi.mock("../../src/db/transaction.js", () => ({
  withTenantTransaction: mocks.withTenantTransaction,
}));
vi.mock("../../src/modules/tenants/repositories/tenant-profile.repository.js", () => ({
  tenantProfileRepository: {
    getProfile: mocks.getProfile,
    upsertProfile: mocks.upsertProfile,
    listActiveAddresses: mocks.listActiveAddresses,
    createAddress: mocks.createAddress,
  },
}));
vi.mock("../../src/modules/tenants/repositories/tenant-profile-audit.repository.js", () => ({
  recordTenantProfileAudit: mocks.recordAudit,
}));

import { tenantProfileService } from "../../src/modules/tenants/application/use-cases/tenant-profile.service.js";

const context = {
  tenantId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  correlationId: "corr-tenant-profile-test",
  actor: {
    type: "USER" as const,
    ref: "https://auth.example.test|user-123",
    membershipId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    identityIssuer: "https://auth.example.test",
    identitySubject: "user-123",
  },
};

describe("tenant profile service", () => {
  beforeEach(() => {
    mocks.withTenantTransaction.mockImplementation(async (_tenantId: string, work: (client: unknown) => Promise<unknown>) =>
      work(mocks.client),
    );
    mocks.getProfile.mockReset();
    mocks.upsertProfile.mockReset();
    mocks.listActiveAddresses.mockReset();
    mocks.createAddress.mockReset();
    mocks.recordAudit.mockReset();
  });

  afterEach(() => vi.clearAllMocks());

  it("always opens profile reads in the trusted tenant transaction", async () => {
    mocks.getProfile.mockResolvedValue(null);
    await expect(tenantProfileService.getProfile(context)).resolves.toBeNull();
    expect(mocks.withTenantTransaction).toHaveBeenCalledWith(context.tenantId, expect.any(Function));
    expect(mocks.getProfile).toHaveBeenCalledWith(mocks.client, context.tenantId);
  });

  it("writes the profile and its audit event in the same transaction", async () => {
    const profile = { tenantId: context.tenantId, tradeName: "Zenox" };
    const input = {
      tradeName: "Zenox",
      timezone: "Africa/Porto-Novo",
      primaryLanguage: "fr",
      supportedLanguages: ["fr", "en"],
      websiteUrl: null,
      generalEmail: null,
      generalPhone: null,
    };
    mocks.upsertProfile.mockResolvedValue(profile);

    await expect(tenantProfileService.updateProfile(context, input)).resolves.toEqual(profile);
    expect(mocks.upsertProfile).toHaveBeenCalledWith(mocks.client, context.tenantId, input);
    expect(mocks.recordAudit).toHaveBeenCalledWith(
      mocks.client,
      context,
      "tenant.profile.updated",
      "TENANT_PROFILE",
      context.tenantId,
      { changedFields: Object.keys(input) },
    );
  });

  it("does not include submitted address values in audit metadata", async () => {
    const address = {
      id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
      tenantId: context.tenantId,
      addressType: "REGISTERED",
      countryCode: "BJ",
      addressLine1: "Sensitive street detail",
    };
    const input = {
      addressType: "REGISTERED" as const,
      addressLine1: "Sensitive street detail",
      city: "Cotonou",
      countryCode: "BJ",
      isPrimary: true,
      validFrom: "2026-01-01",
    };
    mocks.createAddress.mockResolvedValue(address);

    await expect(tenantProfileService.createAddress(context, input)).resolves.toEqual(address);
    expect(mocks.recordAudit).toHaveBeenCalledWith(
      mocks.client,
      context,
      "tenant.address.created",
      "TENANT_ADDRESS",
      address.id,
      { addressType: "REGISTERED", countryCode: "BJ" },
    );
    expect(JSON.stringify(mocks.recordAudit.mock.calls)).not.toContain("Sensitive street detail");
  });

  it("reports missing profile and registered address without changing tenant status", async () => {
    mocks.getProfile.mockResolvedValue(null);
    mocks.listActiveAddresses.mockResolvedValue([]);

    await expect(tenantProfileService.checkProfileCompletion(context)).resolves.toEqual({
      complete: false,
      missingRequirements: ["TENANT_PROFILE", "REGISTERED_ADDRESS"],
    });
    expect(mocks.recordAudit).not.toHaveBeenCalled();
  });
});
