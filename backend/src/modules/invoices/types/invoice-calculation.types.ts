export type DecimalString = string;

export interface InvoiceCalculationLineInput {
  readonly quantity: DecimalString;
  readonly unitPrice: DecimalString;
  readonly discountPercent?: DecimalString;
  readonly taxRatePercent: DecimalString;
}

export interface InvoiceCalculationInput {
  readonly currency: string;
  readonly currencyDecimalPlaces: number;
  readonly lines: readonly InvoiceCalculationLineInput[];
  readonly globalDiscountPercent?: DecimalString;
  readonly globalDiscountAmount?: DecimalString;
}

export interface CalculatedInvoiceLine {
  readonly quantity: DecimalString;
  readonly unitPrice: DecimalString;
  readonly discountPercent: DecimalString;
  readonly taxRatePercent: DecimalString;
  readonly subtotal: DecimalString;
  readonly discountAmount: DecimalString;
  readonly taxableAmount: DecimalString;
  readonly taxAmount: DecimalString;
  readonly total: DecimalString;
}

export interface CalculatedInvoiceTotals {
  readonly currency: string;
  readonly subtotal: DecimalString;
  readonly discountTotal: DecimalString;
  readonly taxableTotal: DecimalString;
  readonly taxTotal: DecimalString;
  readonly grandTotal: DecimalString;
  readonly lines: readonly CalculatedInvoiceLine[];
  readonly calculationPolicy: "LINE_AND_DOCUMENT_DISCOUNT_HALF_UP_TAX_EXCLUSIVE_V2";
}
