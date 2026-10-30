import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  isActive: vi.fn(),
}));

vi.mock("../../src/modules/platform-admin/repositories/platform-operator.repository.js", () => ({
  platformOperatorRepository: { isActive: mocks.isActive },
}));

import {
  PlatformAdminAccessError,
  platformAdminAccessService,
} from "../../src/modules/platform-admin/services/platform-admin-access.service.js";

describe("platformAdminAccessService", () => {
  beforeEach(() => mocks.isActive.mockResolvedValue(true));
  afterEach(() => vi.clearAllMocks());

  it("requires a verified user identity", async () => {
    await expect(platformAdminAccessService.assertActiveOperator(undefined))
      .rejects.toMatchObject({ code: "UNAUTHENTICATED", status: 401 });
    expect(mocks.isActive).not.toHaveBeenCalled();
  });

  it("requires confirmed email before checking operator membership", async () => {
    await expect(platformAdminAccessService.assertActiveOperator({
      id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      issuer: "https://platform-auth.example.test",
      emailConfirmedAt: null,
    })).rejects.toBeInstanceOf(PlatformAdminAccessError);
    expect(mocks.isActive).not.toHaveBeenCalled();
  });

  it("checks the exact issuer and subject supplied by the verified session", async () => {
    await expect(platformAdminAccessService.assertActiveOperator({
      id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      issuer: "https://platform-auth.example.test",
      emailConfirmedAt: "2026-10-30T08:00:00.000Z",
    })).resolves.toBeUndefined();
    expect(mocks.isActive).toHaveBeenCalledWith(
      "https://platform-auth.example.test",
      "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    );
  });

  it("rejects an identity that is not on the active operator allowlist", async () => {
    mocks.isActive.mockResolvedValue(false);
    await expect(platformAdminAccessService.assertActiveOperator({
      id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      issuer: "https://platform-auth.example.test",
      emailConfirmedAt: "2026-10-30T08:00:00.000Z",
    })).rejects.toMatchObject({
      code: "PLATFORM_OPERATOR_REQUIRED",
      status: 403,
    });
  });
});
