import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../src/modules/platform-admin/repositories/platform-operator.repository.js", () => ({
  platformOperatorRepository: { isActive: vi.fn() },
}));
import { platformOperatorRepository } from "../../src/modules/platform-admin/repositories/platform-operator.repository.js";
import { PlatformAdminAccessError, platformAdminAccessService } from "../../src/modules/platform-admin/services/platform-admin-access.service.js";

describe("platformAdminAccessService", () => {
  beforeEach(() => vi.clearAllMocks());

  it("rejects a missing authenticated identity", async () => {
    await expect(platformAdminAccessService.assertActiveOperator(undefined))
      .rejects.toMatchObject({ status: 401, code: "UNAUTHENTICATED" });
    expect(platformOperatorRepository.isActive).not.toHaveBeenCalled();
  });

  it("requires a confirmed email before checking operator membership", async () => {
    await expect(platformAdminAccessService.assertActiveOperator({ id: "subject", issuer: "issuer", emailConfirmedAt: null }))
      .rejects.toMatchObject({ status: 403, code: "EMAIL_CONFIRMATION_REQUIRED" });
    expect(platformOperatorRepository.isActive).not.toHaveBeenCalled();
  });

  it("rejects authenticated users who are not active platform operators", async () => {
    vi.mocked(platformOperatorRepository.isActive).mockResolvedValue(false);
    await expect(platformAdminAccessService.assertActiveOperator({
      id: "subject", issuer: "issuer", emailConfirmedAt: "2026-11-01T10:00:00.000Z",
    })).rejects.toBeInstanceOf(PlatformAdminAccessError);
    expect(platformOperatorRepository.isActive).toHaveBeenCalledWith("issuer", "subject");
  });

  it("accepts an active platform operator", async () => {
    vi.mocked(platformOperatorRepository.isActive).mockResolvedValue(true);
    await expect(platformAdminAccessService.assertActiveOperator({
      id: "subject", issuer: "issuer", emailConfirmedAt: "2026-11-01T10:00:00.000Z",
    })).resolves.toBeUndefined();
  });
});
