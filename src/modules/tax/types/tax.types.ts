export const taxTreatmentSchema = ["STANDARD", "REDUCED", "ZERO_RATED", "EXEMPT", "REVERSE_CHARGE"] as const;
export type TaxTreatment = (typeof taxTreatmentSchema)[number];

export interface TaxRule {
  readonly code: string;
  readonly name: string;
  readonly treatment: TaxTreatment;
  readonly ratePercent: string;
  readonly countryCode: string;
  readonly validFrom: string;
  readonly validTo?: string;
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
