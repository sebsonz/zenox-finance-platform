import { useCallback, useState, type Dispatch, type SetStateAction } from "react";
import type { InvoiceDraftRecord } from "../types/invoice-draft.js";
import type { ApiError, ApiPayload } from "../types/workspace-resources.js";

type Options = {
  tenantId: string;
  search: string;
  status: string;
  setInvoices: Dispatch<SetStateAction<InvoiceDraftRecord[]>>;
  setSelectedInvoiceId: (id: string) => void;
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

export function useInvoiceList({ tenantId, search, status, setInvoices, setSelectedInvoiceId, setNotice }: Options) {
  const [loading, setLoading] = useState(false);
  const loadInvoices = useCallback(async () => {
    if (!tenantId) {
      setNotice("Aucune organisation active n’est disponible.");
      return;
    }
    setLoading(true);
    setNotice("");
    try {
      const params = new URLSearchParams({ limit: "100" });
      if (search.trim()) params.set("search", search.trim());
      if (status) params.set("status", status);
      const data = await readData<{ invoices?: InvoiceDraftRecord[] }>(
        await fetch(`/api/v1/user/tenants/${tenantId}/invoices?${params.toString()}`, {
          credentials: "same-origin",
          cache: "no-store",
        }),
        "Impossible de charger les factures.",
      );
      setInvoices(data.invoices ?? []);
      setSelectedInvoiceId((current) => (data.invoices ?? []).some((item) => item.id === current) ? current : "");
      setNotice(`${data.invoices?.length ?? 0} facture(s) chargée(s).`);
    } catch (error) {
      setInvoices([]);
      setNotice(error instanceof Error ? error.message : "Impossible de charger les factures.");
    } finally {
      setLoading(false);
    }
  }, [tenantId, search, status, setInvoices, setSelectedInvoiceId, setNotice]);
  return { loading, loadInvoices };
}
