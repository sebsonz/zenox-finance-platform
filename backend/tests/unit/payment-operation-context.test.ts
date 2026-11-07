import { describe,expect,it } from "vitest";
import { paymentActor } from "../../src/modules/payments/types/payment-operation-context.js";

describe("paymentActor",()=>{
 it("preserves verified human identity for tenant user operations",()=>{
  expect(paymentActor({tenantId:"tenant",correlationId:"corr",actor:{type:"USER",ref:"issuer|subject",membershipId:"membership",identityIssuer:"issuer",identitySubject:"subject"}}))
   .toEqual({type:"USER",ref:"issuer|subject"});
 });
 it("preserves verified integration principal identity for service operations",()=>{
  expect(paymentActor({tenantId:"tenant",correlationId:"corr",principal:{id:"principal",principalCode:"integration",displayName:"Integration",scopes:[],allowedTenantIds:["tenant"]}}))
   .toEqual({type:"SERVICE",ref:"principal"});
 });
});
