import { describe, expect, it } from "vitest";
import type { FinanceRequestContext } from "../../src/modules/integration-auth/types/authenticated-principal.js";
import { invoiceActor, isUserInvoiceContext } from "../../src/modules/invoices/types/invoice-operation-context.js";

describe("invoice operation actor", () => {
  it("preserves integration principals as service actors", () => {
    const context: FinanceRequestContext = {
      tenantId: "8d0d4a8e-71d8-47bd-a8f0-3d5c5e38df21",
      correlationId: "corr-service-1",
      principal: {
        id: "d87c9c64-65fb-4c22-82a5-0a6b0d9c2a44",
        principalCode: "zenox-fret",
        displayName: "ZENOX FRET",
        scopes: ["invoice:draft:write"],
        allowedTenantIds: ["8d0d4a8e-71d8-47bd-a8f0-3d5c5e38df21"],
      },
    };
    expect(invoiceActor(context)).toEqual({
      type: "SERVICE",
      ref: "d87c9c64-65fb-4c22-82a5-0a6b0d9c2a44",
    });
    expect(isUserInvoiceContext(context)).toBe(false);
  });

  it("preserves a human user as a USER actor without a principal field", () => {
    const context = {
      tenantId: "8d0d4a8e-71d8-47bd-a8f0-3d5c5e38df21",
      correlationId: "corr-user-1",
      actor: {
        type: "USER" as const,
        ref: "https://identity.example|subject-123",
        membershipId: "b3a05f4b-95c6-42d7-bb67-29d2d3d00b8d",
        identityIssuer: "https://identity.example",
        identitySubject: "subject-123",
      },
    };
    expect(invoiceActor(context)).toEqual({
      type: "USER",
      ref: "https://identity.example|subject-123",
    });
    expect(isUserInvoiceContext(context)).toBe(true);
    expect("principal" in context).toBe(false);
  });
});
