import { describe, expect, it } from "vitest";
import {
  assertActiveMembershipCan,
  hasFinanceUserPermission,
} from "../../src/modules/tenants/services/user-tenant-permissions.service.js";

describe("Finance user tenant role permissions", () => {
  it("allows a viewer to read invoices but not issue them", () => {
    expect(hasFinanceUserPermission("VIEWER", "invoices:read")).toBe(true);
    expect(hasFinanceUserPermission("VIEWER", "invoices:issue")).toBe(false);
  });

  it("allows a finance operator to record payments but not manage tax rules", () => {
    expect(hasFinanceUserPermission("FINANCE_OPERATOR", "payments:record")).toBe(true);
    expect(hasFinanceUserPermission("FINANCE_OPERATOR", "tax:manage")).toBe(false);
  });

  it("allows a finance manager to issue invoices", () => {
    expect(hasFinanceUserPermission("FINANCE_MANAGER", "invoices:issue")).toBe(true);
  });

  it("requires active membership even when the role has permission", () => {
    expect(() => assertActiveMembershipCan(
      { status: "PENDING", role_code: "OWNER" },
      "members:manage",
    )).toThrow("User is not authorized for this tenant operation");
  });

  it("rejects permissions not assigned to the membership role", () => {
    expect(() => assertActiveMembershipCan(
      { status: "ACTIVE", role_code: "VIEWER" },
      "members:manage",
    )).toThrow("User is not authorized for this tenant operation");
  });

  it("allows an active owner to manage membership", () => {
    expect(() => assertActiveMembershipCan(
      { status: "ACTIVE", role_code: "OWNER" },
      "members:manage",
    )).not.toThrow();
  });
});
