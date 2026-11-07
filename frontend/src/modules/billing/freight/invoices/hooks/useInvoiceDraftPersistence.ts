import { useCallback } from "react";
import type { DraftForm, InvoiceDraftRecord } from "../types/invoice-draft.js";
import type { ApiError, ApiPayload } from "../types/workspace-resources.js";

type Options = {
  tenantId: string;
  form: DraftForm;
  editing: InvoiceDraftRecord | null;
  setInvoices: (update: (current: InvoiceDraftRecord[]) => InvoiceDraftRecord[]) => void;
  setEditing: (invoice: InvoiceDraftRecord | null) => void;
  setSelectedInvoiceId: (id: string) => void;
  setBusy: (busy: boolean) => void;
  setNotice: (message: string) => void;
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

export function useInvoiceDraftPersistence({
  tenantId, form, editing, setInvoices, setEditing, setSelectedInvoiceId, setBusy, setNotice,
}: Options) {
  const saveStandardDraft = useCallback(async (): Promise<boolean> => {
    if (!tenantId || !form.customerId || !form.currencyCode || form.lines.some((line) => !line.description.trim())) {
      setNotice("Renseignez le client, la devise et la description de chaque ligne.");
      return false;
    }
    setBusy(true);
    setNotice("");
    const payload = {
      documentType: form.documentType,
      ...(form.documentType === "DEPOSIT" ? { contractTotal: form.contractTotal } : {}),
      ...(form.documentType === "BALANCE" ? { relatedInvoiceId: form.relatedInvoiceId } : {}),
      customerId: form.customerId,
      currencyCode: form.currencyCode,
      ...(form.dueDate ? { dueDate: form.dueDate } : {}),
      ...(form.purchaseOrderReference.trim() ? { purchaseOrderReference: form.purchaseOrderReference.trim() } : {}),
      ...(form.serviceDate ? { serviceDate: form.serviceDate } : {}),
      ...(form.paymentTerms.trim() ? { paymentTerms: form.paymentTerms.trim() } : {}),
      ...(form.paymentInstructions.trim() ? { paymentInstructions: form.paymentInstructions.trim() } : {}),
      ...(form.externalReference.trim() ? { externalReference: form.externalReference.trim() } : {}),
      ...(form.footerNote.trim() ? { footerNote: form.footerNote.trim() } : {}),
      ...(form.notes.trim() ? { notes: form.notes.trim() } : {}),
      lines: form.lines.map((line) => ({ ...line, description: line.description.trim() })),
      ...(editing ? { expectedUpdatedAt: editing.updatedAt } : {}),
    };
    try {
      const response = await fetch(editing
        ? `/api/v1/user/tenants/${tenantId}/invoices/drafts/${editing.id}`
        : `/api/v1/user/tenants/${tenantId}/invoices/drafts`, {
        method: editing ? "PUT" : "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await readData<{ invoice: InvoiceDraftRecord }>(response, "Impossible d’enregistrer le brouillon.");
      const savedInvoice = data.invoice;
      setInvoices((current) => [savedInvoice, ...current.filter((item) => item.id !== savedInvoice.id)]);
      setEditing(savedInvoice);
      setSelectedInvoiceId(savedInvoice.id);
      setNotice(editing ? "Brouillon mis à jour." : "Brouillon créé.");
      try {
        const refreshed = await fetch(`/api/v1/user/tenants/${tenantId}/invoices?limit=100`, {
          credentials: "same-origin", cache: "no-store",
        });
        const refreshedData = await readData<{ invoices?: InvoiceDraftRecord[] }>(refreshed, "Impossible d’actualiser les factures.");
        const refreshedInvoices = refreshedData.invoices ?? [];
        const reconciledInvoice = refreshedInvoices.find((item) => item.id === savedInvoice.id) ?? savedInvoice;
        setInvoices(() => [reconciledInvoice, ...refreshedInvoices.filter((item) => item.id !== savedInvoice.id)]);
        setEditing(reconciledInvoice);
      } catch {
        // A failed reconciliation must not hide a successful server write.
      }
      return true;
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Erreur d’enregistrement.");
      return false;
    } finally {
      setBusy(false);
    }
  }, [tenantId, form, editing, setInvoices, setEditing, setSelectedInvoiceId, setBusy, setNotice]);
  return { saveStandardDraft };
}
