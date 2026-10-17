export interface FinanceCurrency {
  code: string;
  name: string;
  minorUnit: number;
  isActive: boolean;
  source: string;
}

export function assertCurrencyCode(value: string): string {
  const normalized = value.trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(normalized)) {
    throw new Error("INVALID_CURRENCY_CODE");
  }
  return normalized;
}
