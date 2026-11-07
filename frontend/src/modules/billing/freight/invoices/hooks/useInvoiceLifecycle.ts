import { useCallback } from "react";
import type { InvoiceDraftRecord } from "../types/invoice-draft.js";
import type { ApiError, ApiPayload } from "../types/workspace-resources.js";

export type InvoiceTaxFacts = {
  transactionType: string;
  supplierIfuStatus: string;
  customerIfuStatus: string;
  customerTaxStatus: string;
  customerCountryCode: string;
  supplierCountryCode: string;
  isImport: string;
  isExport: string;
  goodsCategory: string;
};

type Options = {
  tenantId: string;
  jurisdictionId: string;
  taxDate: string;
  appliesTo: string;
  taxFacts: InvoiceTaxFacts;
  setBusy: (busy: boolean) => void;
  setNotice: (message: string) => void;
  loadInvoices: () => Promise<InvoiceDraftRecord[]>;
  setEditing: (invoice: InvoiceDraftRecord | null) => void;
};

async function responseError(response: Response, fallback: string): Promise<string> {
  try {
    const payload = await response.json() as ApiError;
    return payload.error?.message ?? fallback;
  } catch {
    return fallback;
  }
}

async function readData<T>(response: Response, fallback: string): Promise<T> {
  if (!response.ok) throw new Error(await responseError(response, fallback));
  const payload = await response.json() as ApiPayload<T>;
  if (!payload.data) throw new Error(fallback);
  return payload.data;
}

export function useInvoiceLifecycle({
  tenantId, jurisdictionId, taxDate, appliesTo, taxFacts, setBusy, setNotice, loadInvoices, setEditing,
}: Options) {
  const calculateTax = useCallback(async (invoice: InvoiceDraftRecord): Promise<InvoiceDraftRecord | null> => {
    if (!jurisdictionId) {
      setNotice("Aucune juridiction fiscale active n’est disponible.");
      return null;
    }
    setBusy(true);
    setNotice("");
    try {
      const response = await fetch(`/api/v1/user/tenants/${tenantId}/invoices/${invoice.id}/tax-snapshot`, {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          expectedUpdatedAt: invoice.updatedAt,
          taxDate,
          jurisdictionId,
          appliesTo,
          taxFacts: {
            ...(taxFacts.transactionType.trim() ? { transactionType: taxFacts.transactionType.trim() } : {}),
            ...(taxFacts.supplierIfuStatus ? { supplierIfuStatus: taxFacts.supplierIfuStatus } : {}),
            ...(taxFacts.customerIfuStatus ? { customerIfuStatus: taxFacts.customerIfuStatus } : {}),
            ...(taxFacts.customerTaxStatus.trim() ? { customerTaxStatus: taxFacts.customerTaxStatus.trim() } : {}),
            ...(taxFacts.customerCountryCode.trim() ? { customerCountryCode: taxFacts.customerCountryCode.trim().toUpperCase() } : {}),
            ...(taxFacts.supplierCountryCode.trim() ? { supplierCountryCode: taxFacts.supplierCountryCode.trim().toUpperCase() } : {}),
            ...(taxFacts.isImport ? { isImport: taxFacts.isImport === "true" } : {}),
            ...(taxFacts.isExport ? { isExport: taxFacts.isExport === "true" } : {}),
            ...(taxFacts.goodsCategory.trim() ? { goodsCategory: taxFacts.goodsCategory.trim() } : {}),
          },
        }),
      });
      await readData(response, "Le calcul fiscal a échoué.");
      const refreshedInvoices = await loadInvoices();
      const refreshedInvoice = refreshedInvoices.find((item) => item.id === invoice.id);
      if (!refreshedInvoice) throw new Error("Le calcul fiscal a réussi, mais le brouillon actualisé est introuvable. Rechargez la liste avant l’émission.");
      setEditing(refreshedInvoice);
      setNotice(refreshedInvoice.taxStatus === "CALCULATED"
        ? "Snapshot fiscal calculé et attaché. La facture est prête pour confirmation d’émission."
        : "Le moteur fiscal a demandé une revue. Consultez le statut fiscal avant toute émission.");
      return refreshedInvoice;
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Le calcul fiscal a échoué.");
      return null;
    } finally {
      setBusy(false);
    }
  }, [tenantId, jurisdictionId, taxDate, appliesTo, taxFacts, setBusy, setNotice, loadInvoices, setEditing]);

  const issueInvoice = useCallback(async (invoice: InvoiceDraftRecord) => {
    if (!window.confirm(`Émettre définitivement la facture ${invoice.invoiceCode ?? "brouillon"} ? Cette opération est irréversible.`)) return;
    setBusy(true);
    setNotice("");
    try {
      const response = await fetch(`/api/v1/user/tenants/${tenantId}/invoices/${invoice.id}/issue`, {
        method: "POST",
        credentials: "same-origin",
        headers: {
          "content-type": "application/json",
          "Idempotency-Key": `issue-${invoice.id}-v${invoice.documentVersion}`,
        },
        body: JSON.stringify({ expectedUpdatedAt: invoice.updatedAt }),
      });
      await readData(response, "L’émission de la facture a échoué.");
      const refreshedInvoices = await loadInvoices();
      const issuedInvoice = refreshedInvoices.find((item) => item.id === invoice.id);
      if (issuedInvoice) setEditing(issuedInvoice);
      setNotice("Facture émise. Les documents HTML et PDF immuables sont disponibles.");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "L’émission a échoué.");
    } finally {
      setBusy(false);
    }
  }, [tenantId, setBusy, setNotice, loadInvoices, setEditing]);

  return { calculateTax, issueInvoice };
}
