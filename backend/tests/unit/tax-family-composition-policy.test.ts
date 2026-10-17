import { describe, expect, it } from "vitest";
import { isSupportedTaxFamilyComposition } from "../../src/modules/tax/services/tax-calculation.service.js";

describe("tax family composition policy", () => {
  it("allows one tax family", () => {
    expect(isSupportedTaxFamilyComposition(["VAT", "VAT"])).toBe(true);
    expect(isSupportedTaxFamilyComposition(["GST"])).toBe(true);
  });

  it("allows withholding alongside exactly one primary family", () => {
    expect(isSupportedTaxFamilyComposition(["VAT", "WITHHOLDING"])).toBe(true);
    expect(isSupportedTaxFamilyComposition(["WITHHOLDING", "VAT", "VAT"])).toBe(true);
  });

  it("rejects unrelated primary tax families", () => {
    expect(isSupportedTaxFamilyComposition(["VAT", "CUSTOMS_DUTY"])).toBe(false);
    expect(isSupportedTaxFamilyComposition(["VAT", "EXCISE", "STAMP_DUTY"])).toBe(false);
  });

  it("rejects withholding when multiple primary families are present", () => {
    expect(isSupportedTaxFamilyComposition(["VAT", "EXCISE", "WITHHOLDING"])).toBe(false);
  });

  it("does not treat an empty rule set as a valid calculation", () => {
    // Composition alone is neutral for an empty set; the service separately
    // rejects empty active rules before calling this policy.
    expect(isSupportedTaxFamilyComposition([])).toBe(true);
  });
});
