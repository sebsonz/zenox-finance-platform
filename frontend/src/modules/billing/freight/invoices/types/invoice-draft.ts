export type InvoiceLine = {
  id?: string;
  description: string;
  quantity: string;
  unitPrice: string;
  discountPercent: string;
  taxRatePercent: string;
};

export type DraftForm = {
  documentType: "STANDARD" | "DEPOSIT" | "BALANCE" | "CREDIT_NOTE";
  contractTotal: string;
  relatedInvoiceId: string;
  customerId: string;
  currencyCode: string;
  dueDate: string;
  notes: string;
  purchaseOrderReference: string;
  serviceDate: string;
  paymentTerms: string;
  paymentInstructions: string;
  externalReference: string;
  footerNote: string;
  lines: InvoiceLine[];
};

export type InvoiceDraftRecord = {
  id: string;
  customerId: string;
  invoiceCode: string | null;
  status: "DRAFT" | "ISSUED" | "CANCELLED";
  documentType: "STANDARD" | "DEPOSIT" | "BALANCE";
  contractTotal: string | null;
  relatedInvoiceId: string | null;
  currencyCode: string;
  currencyMinorUnit: number;
  grandTotal: string;
  amountDue: string;
  subtotal: string;
  taxTotal: string;
  createdAt: string;
  updatedAt: string;
  dueDate: string | null;
  notes: string | null;
  purchaseOrderReference: string | null;
  serviceDate: string | null;
  paymentTerms: string | null;
  paymentInstructions: string | null;
  externalReference: string | null;
  footerNote: string | null;
  documentVersion: number;
  taxSnapshotId: string | null;
  taxStatus: "PROVISIONAL" | "CALCULATED" | "REVIEW_REQUIRED";
  customerSnapshot?: { legalName?: string; displayName?: string };
  lines: Array<{
    id: string;
    description: string;
    quantity: string;
    unitPrice: string;
    discountPercent: string;
    taxRatePercent: string;
    total: string;
  }>;
};

export const createEmptyInvoiceLine = (): InvoiceLine => ({
  description: "",
  quantity: "1",
  unitPrice: "0",
  discountPercent: "0",
  taxRatePercent: "0",
});

export const createEmptyInvoiceDraft = (): DraftForm => ({
  documentType: "STANDARD",
  contractTotal: "",
  relatedInvoiceId: "",
  customerId: "",
  currencyCode: "XOF",
  dueDate: "",
  notes: "",
  purchaseOrderReference: "",
  serviceDate: "",
  paymentTerms: "",
  paymentInstructions: "",
  externalReference: "",
  footerNote: "",
  lines: [createEmptyInvoiceLine()],
});
