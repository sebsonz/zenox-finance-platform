import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../src/modules/tax/repositories/platform-tax-approval.repository.js", () => ({
  platformTaxApprovalRepository: { submit: vi.fn(), review: vi.fn() },
}));
vi.mock("../../src/modules/tax/repositories/platform-tax-delegation.repository.js", () => ({
  platformTaxDelegationRepository: { list: vi.fn(), create: vi.fn(), revoke: vi.fn() },
}));
vi.mock("../../src/modules/tax/repositories/platform-tax-jurisdiction-admin.repository.js", () => ({
  platformTaxJurisdictionAdminRepository: { upsert: vi.fn(), upsertLevel: vi.fn(), listLevels: vi.fn(), listAuditEvents: vi.fn() },
}));
import { platformTaxApprovalRepository } from "../../src/modules/tax/repositories/platform-tax-approval.repository.js";
import { platformTaxJurisdictionAdminRepository } from "../../src/modules/tax/repositories/platform-tax-jurisdiction-admin.repository.js";
import { platformTaxDelegationRepository } from "../../src/modules/tax/repositories/platform-tax-delegation.repository.js";
import { managePlatformTaxDelegations } from "../../src/modules/tax/application/manage-platform-tax-delegations.use-case.js";
import { submitGlobalTaxRule } from "../../src/modules/tax/application/submit-global-tax-rule.use-case.js";
import { reviewGlobalTaxRule } from "../../src/modules/tax/application/review-global-tax-rule.use-case.js";
import { managePlatformTaxJurisdiction } from "../../src/modules/tax/application/manage-platform-tax-jurisdiction.use-case.js";

describe("platform tax workflow use cases", () => {
  beforeEach(() => vi.clearAllMocks());

  it("delegates rule submission to the approval repository", async () => {
    vi.mocked(platformTaxApprovalRepository.submit).mockResolvedValue("approval-1");
    await expect(submitGlobalTaxRule.execute({ ruleId: "rule-1", actorIssuer: "issuer", actorSubject: "actor", correlationId: "corr-1" })).resolves.toBe("approval-1");
  });

  it("delegates approval decisions to the database-backed repository", async () => {
    vi.mocked(platformTaxApprovalRepository.review).mockResolvedValue({ approval_id: "approval-1", rule_id: "rule-1", status: "REJECTED" });
    await expect(reviewGlobalTaxRule.execute({
      approvalId: "approval-1", decision: "REJECT", reason: "Source légale insuffisante",
      actorIssuer: "issuer", actorSubject: "reviewer", correlationId: "corr-2",
    })).resolves.toMatchObject({ status: "REJECTED" });
  });

  it("delegates jurisdiction and hierarchy writes to their repository", async () => {
    vi.mocked(platformTaxJurisdictionAdminRepository.upsert).mockResolvedValue("jurisdiction-1");
    vi.mocked(platformTaxJurisdictionAdminRepository.upsertLevel).mockResolvedValue("level-1");
    await expect(managePlatformTaxJurisdiction.upsert({
      id: null, code: "BJ", countryCode: "BJ", name: "Bénin", levelCode: "COUNTRY",
      parentId: null, isActive: true, actorIssuer: "issuer", actorSubject: "operator",
      reason: "Création de la juridiction nationale", correlationId: "corr-3",
    })).resolves.toBe("jurisdiction-1");
    await expect(managePlatformTaxJurisdiction.upsertLevel({
      countryCode: "BJ", levelCode: "DEPARTMENT", label: "Département",
      parentLevelCode: "COUNTRY", sortOrder: 10, isRequired: true, isActive: true,
      actorIssuer: "issuer", actorSubject: "operator", reason: "Ajout du niveau départemental",
      correlationId: "corr-4",
    })).resolves.toBe("level-1");
  });
  it("delegates tax permission grants and revocations to the audited repository", async () => {
    vi.mocked(platformTaxDelegationRepository.create).mockResolvedValue("delegation-1");
    vi.mocked(platformTaxDelegationRepository.revoke).mockResolvedValue(true);
    await expect(managePlatformTaxDelegations.create({
      identityIssuer: "issuer", identitySubject: "agent", jurisdictionId: null, countryCode: "BJ",
      permissions: ["RULE_REVIEW"], validFrom: "2026-11-19T00:00:00.000Z", validTo: null,
      reason: "Délégation de revue fiscale", actorIssuer: "issuer", actorSubject: "operator",
      correlationId: "corr-5",
    })).resolves.toBe("delegation-1");
    await expect(managePlatformTaxDelegations.revoke({
      delegationId: "delegation-1", reason: "Fin de la mission fiscale",
      actorIssuer: "issuer", actorSubject: "operator", correlationId: "corr-6",
    })).resolves.toBe(true);
  });
});
