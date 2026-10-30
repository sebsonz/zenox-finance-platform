import type {
  FinanceUserMembership,
  FinanceUserRole,
} from "../repositories/user-tenant-membership.repository.js";

export type FinanceUserPermission =
  | "tenant:read"
  | "members:read"
  | "members:manage"
  | "settings:manage"
  | "customers:read"
  | "customers:manage"
  | "invoices:read"
  | "invoices:create"
  | "invoices:issue"
  | "invoices:credit"
  | "payments:read"
  | "payments:record"
  | "payments:allocate"
  | "tax:read"
  | "tax:manage";

const ROLE_PERMISSIONS: Readonly<Record<FinanceUserRole, readonly FinanceUserPermission[]>> = {
  OWNER: [
    "tenant:read", "members:read", "members:manage", "settings:manage",
    "customers:read", "customers:manage", "invoices:read", "invoices:create", "invoices:issue", "invoices:credit",
    "payments:read", "payments:record", "payments:allocate",
    "tax:read", "tax:manage",
  ],
  ADMIN: [
    "tenant:read", "members:read", "members:manage", "settings:manage",
    "customers:read", "customers:manage",
    "invoices:read", "invoices:create", "invoices:issue", "invoices:credit",
    "payments:read", "payments:record", "payments:allocate",
    "tax:read", "tax:manage",
  ],
  FINANCE_MANAGER: [
    "tenant:read", "members:read", "customers:read", "customers:manage",
    "invoices:read", "invoices:create", "invoices:issue", "invoices:credit",
    "payments:read", "payments:record", "payments:allocate",
    "tax:read", "tax:manage",
  ],
  FINANCE_OPERATOR: [
    "tenant:read", "invoices:read", "invoices:create",
    "payments:read", "payments:record", "payments:allocate", "tax:read",
  ],
  VIEWER: ["tenant:read", "members:read", "customers:read", "invoices:read", "payments:read", "tax:read"],
};

export function hasFinanceUserPermission(
  role: FinanceUserRole,
  permission: FinanceUserPermission,
): boolean {
  return ROLE_PERMISSIONS[role].includes(permission);
}

export function assertActiveMembershipCan(
  membership: Pick<FinanceUserMembership, "status" | "role_code">,
  permission: FinanceUserPermission,
): void {
  if (membership.status !== "ACTIVE" || !hasFinanceUserPermission(membership.role_code, permission)) {
    const error = new Error("User is not authorized for this tenant operation");
    error.name = "UserTenantPermissionDeniedError";
    throw error;
  }
}
