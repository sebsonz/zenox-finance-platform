import { StandardInvoiceFields } from "./StandardInvoiceFields.js";
import type { InvoiceTypeFieldsProps } from "./types.js";
export function DepositInvoiceFields(props: InvoiceTypeFieldsProps) {
  return <>
    <label>Montant total du contrat<input inputMode="decimal" value={props.contractTotal} onChange={(event) => props.onContractTotalChange(event.target.value)} placeholder="Montant total avant acompte" required/></label>
    <StandardInvoiceFields {...props}/>
  </>;
}