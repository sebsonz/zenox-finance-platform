import { Decimal } from "decimal.js";

/**
 * A deposit contract total must strictly exceed the calculated deposit invoice
 * grand total. This comparison belongs to the invoice domain/service layer,
 * not the request-shape schema, because the grand total depends on currency
 * precision and the server-side invoice calculation policy.
 */
export function isContractTotalGreaterThanInvoiceTotal(
  contractTotal: string,
  invoiceGrandTotal: string,
): boolean {
  const contract = new Decimal(contractTotal);
  const invoice = new Decimal(invoiceGrandTotal);
  return contract.isFinite() && invoice.isFinite() && contract.gt(invoice);
}
