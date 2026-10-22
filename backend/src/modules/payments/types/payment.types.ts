export type PaymentStatus = "PENDING" | "CONFIRMED" | "SETTLED" | "FAILED" | "CANCELLED";
export type PaymentSource = "MANUAL" | "PROVIDER";
export type PaymentMethod = "CASH" | "BANK_TRANSFER" | "MOBILE_MONEY" | "CARD" | "OTHER" | "PROVIDER";

export interface PaymentRecord {
  id: string;
  amount: string;
  currencyCode: string;
  status: PaymentStatus;
  source: PaymentSource;
  method: PaymentMethod;
  externalReference: string | null;
  providerCode: string | null;
  description: string | null;
  confirmedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PaymentAllocationRecord {
  id: string;
  paymentId: string;
  invoiceId: string;
  amount: string;
  currencyCode: string;
  createdAt: string;
}

export interface InvoiceBalanceRecord {
  invoiceId: string;
  invoiceCode: string | null;
  status: "DRAFT" | "ISSUED" | "CANCELLED";
  currencyCode: string;
  grandTotal: string;
  allocatedAmount: string;
  remainingBalance: string;
}
