export const taxTreatmentSchema = [
  "STANDARD",
  "REDUCED",
  "ZERO_RATED",
  "EXEMPT",
  "REVERSE_CHARGE",
  "WITHHOLDING",
] as const;
export type TaxTreatment = (typeof taxTreatmentSchema)[number];

export type TaxPriceMode = "EXCLUSIVE" | "INCLUSIVE";

export interface TaxRule {
  readonly code: string;
  readonly name: string;
  readonly treatment: TaxTreatment;
  readonly ratePercent: string;
  readonly countryCode: string;
  readonly jurisdictionCode?: string;
  readonly taxCategory?: string;
  readonly priority?: number;
  readonly isCompound?: boolean;
  readonly validFrom: string;
  readonly validTo?: string;
  readonly sourceReference?: string;
  readonly version?: number;
}

export interface TaxCalculationInput {
  readonly taxableAmount: string;
  readonly ratePercent: string;
  readonly treatment: TaxTreatment;
  readonly currencyDecimalPlaces: number;
}

export interface TaxCalculationResult {
  readonly treatment: TaxTreatment;
  readonly ratePercent: string;
  readonly taxableAmount: string;
  readonly taxAmount: string;
  readonly totalAmount: string;
  readonly calculationPolicy: "TAX_EXCLUSIVE_HALF_UP_V1";
}

export interface TaxComponentInput {
  readonly ruleCode: string;
  readonly treatment: TaxTreatment;
  readonly ratePercent: string;
  readonly isCompound?: boolean;
}

export interface TaxStackCalculationInput {
  /** Line amount before discounts and taxes. Discounts must be applied before this engine. */
  readonly amount: string;
  readonly priceMode: TaxPriceMode;
  readonly currency: string;
  readonly currencyDecimalPlaces: number;
  readonly taxes: readonly TaxComponentInput[];
}

export interface CalculatedTaxComponent {
  readonly ruleCode: string;
  readonly treatment: TaxTreatment;
  readonly ratePercent: string;
  readonly taxableBase: string;
  readonly taxAmount: string;
  readonly isCompound: boolean;
}

export interface TaxStackCalculationResult {
  readonly currency: string;
  readonly priceMode: TaxPriceMode;
  readonly baseAmount: string;
  readonly taxTotal: string;
  readonly withholdingTotal: string;
  readonly grandTotal: string;
  readonly amountDue: string;
  readonly taxes: readonly CalculatedTaxComponent[];
  readonly calculationPolicy: "TAX_STACK_HALF_UP_V1";
}
