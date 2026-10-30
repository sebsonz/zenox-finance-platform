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

  it("allows only finance administrators and managers to issue full-reversal credit notes", () => {
    expect(hasFinanceUserPermission("OWNER", "invoices:credit")).toBe(true);
    expect(hasFinanceUserPermission("ADMIN", "invoices:credit")).toBe(true);
    expect(hasFinanceUserPermission("FINANCE_MANAGER", "invoices:credit")).toBe(true);
    expect(hasFinanceUserPermission("FINANCE_OPERATOR", "invoices:credit")).toBe(false);
    expect(hasFinanceUserPermission("VIEWER", "invoices:credit")).toBe(false);
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

  it("allows only owner, admin and finance manager to manage customers", () => {
    for (const role of ["OWNER", "ADMIN", "FINANCE_MANAGER"] as const) {
      expect(hasFinanceUserPermission(role, "customers:manage")).toBe(true);
    }
    expect(hasFinanceUserPermission("FINANCE_OPERATOR", "customers:manage")).toBe(false);
    expect(hasFinanceUserPermission("VIEWER", "customers:manage")).toBe(false);
    expect(hasFinanceUserPermission("FINANCE_OPERATOR", "customers:read")).toBe(true);
  });

});
