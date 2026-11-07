import { useCallback, useState } from "react";
import {
  createEmptyInvoiceDraft,
  type DraftForm,
  type InvoiceDraftRecord,
  type InvoiceLine,
} from "../types/invoice-draft.js";
import type { Customer, Currency } from "../types/workspace-resources.js";

type Options = {
  customers: Customer[];
  currencies: Currency[];
  setSelectedInvoiceId: (id: string) => void;
  setNotice: (message: string) => void;
};

export function useInvoiceDraft({ customers, currencies, setSelectedInvoiceId, setNotice }: Options) {
  const [form, setForm] = useState<DraftForm>(createEmptyInvoiceDraft);
  const [editing, setEditing] = useState<InvoiceDraftRecord | null>(null);

  const resetDraft = useCallback(() => {
    setEditing(null);
    setForm({
      ...createEmptyInvoiceDraft(),
      customerId: customers[0]?.id ?? "",
      currencyCode: currencies[0]?.code ?? "XOF",
    });
  }, [customers, currencies]);

  const startEdit = useCallback((invoice: InvoiceDraftRecord) => {
    if (invoice.status !== "DRAFT") {
      setNotice("Seuls les brouillons peuvent être modifiés.");
      return;
    }
    setEditing(invoice);
    setForm({
      documentType: invoice.documentType ?? "STANDARD",
      contractTotal: invoice.contractTotal ?? "",
      relatedInvoiceId: invoice.relatedInvoiceId ?? "",
      customerId: invoice.customerId,
      currencyCode: invoice.currencyCode,
      dueDate: invoice.dueDate ?? "",
      notes: invoice.notes ?? "",
      purchaseOrderReference: invoice.purchaseOrderReference ?? "",
      serviceDate: invoice.serviceDate ?? "",
      paymentTerms: invoice.paymentTerms ?? "",
      paymentInstructions: invoice.paymentInstructions ?? "",
      externalReference: invoice.externalReference ?? "",
      footerNote: invoice.footerNote ?? "",
      lines: invoice.lines.map((line) => ({
        description: line.description,
        quantity: line.quantity,
        unitPrice: line.unitPrice,
        discountPercent: line.discountPercent,
        taxRatePercent: line.taxRatePercent,
      })),
    });
    setSelectedInvoiceId(invoice.id);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, [setNotice, setSelectedInvoiceId]);

  const updateLine = useCallback((index: number, field: keyof InvoiceLine, value: string) => {
    setForm((current) => ({
      ...current,
      lines: current.lines.map((line, lineIndex) =>
        lineIndex === index ? { ...line, [field]: value } : line,
      ),
    }));
  }, []);

  const addLine = useCallback(() => {
    setForm((current) => ({
      ...current,
      lines: [...current.lines, {
        description: "",
        quantity: "1",
        unitPrice: "0",
        discountPercent: "0",
        taxRatePercent: "0",
      }],
    }));
  }, []);

  const removeLine = useCallback((index: number) => {
    setForm((current) => ({
      ...current,
      lines: current.lines.filter((_, lineIndex) => lineIndex !== index),
    }));
  }, []);

  return {
    form,
    setForm,
    editing,
    setEditing,
    resetDraft,
    startEdit,
    updateLine,
    addLine,
    removeLine,
  };
}
