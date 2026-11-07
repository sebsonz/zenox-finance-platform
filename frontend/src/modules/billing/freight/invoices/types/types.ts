import type { ChangeEvent } from "react";

export type InvoiceOption = { id: string; invoiceCode: string | null; status: "DRAFT" | "ISSUED" | "CANCELLED"; documentType: "STANDARD" | "DEPOSIT" | "BALANCE"; grandTotal: string; currencyCode: string; customerId: string; customerSnapshot?: { legalName?: string } };
export type InvoiceCustomer = { id: string; customerCode: string; legalName: string; displayName: string | null };
export type InvoiceCurrency = { code: string; name: string };
export type InvoiceTypeFieldsProps = {
  documentType: "STANDARD" | "DEPOSIT" | "BALANCE" | "CREDIT_NOTE";
  contractTotal: string; relatedInvoiceId: string; customerId: string; currencyCode: string;
  dueDate: string; serviceDate: string; purchaseOrderReference: string; externalReference: string;
  paymentTerms: string; paymentInstructions: string; footerNote: string; notes: string;
  creditNoteReason: string; creditNoteAmount: string;
  invoices: InvoiceOption[]; customers: InvoiceCustomer[]; currencies: InvoiceCurrency[];
  onContractTotalChange: (value: string) => void; onRelatedInvoiceChange: (invoice: InvoiceOption | undefined, id: string) => void;
  onCustomerChange: (value: string) => void; onCurrencyChange: (value: string) => void;
  onFieldChange: (field: "dueDate" | "serviceDate" | "purchaseOrderReference" | "externalReference" | "paymentTerms" | "paymentInstructions" | "footerNote" | "notes", value: string) => void;
  onCreditReasonChange: (value: string) => void; onCreditAmountChange: (value: string) => void;
};
