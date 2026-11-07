import { BalanceInvoiceFields } from "./BalanceInvoiceFields.js";
import { CreditNoteFields } from "./CreditNoteFields.js";
import { DepositInvoiceFields } from "./DepositInvoiceFields.js";
import { StandardInvoiceFields } from "./StandardInvoiceFields.js";
import type { InvoiceTypeFieldsProps } from "./types.js";
export function InvoiceTypeFields(props: InvoiceTypeFieldsProps) {
  switch (props.documentType) {
    case "DEPOSIT": return <DepositInvoiceFields {...props}/>;
    case "BALANCE": return <BalanceInvoiceFields {...props}/>;
    case "CREDIT_NOTE": return <CreditNoteFields {...props}/>;
    case "STANDARD": return <StandardInvoiceFields {...props}/>;
  }
}