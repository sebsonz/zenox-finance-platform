import { useEffect, useState, type Dispatch, type SetStateAction } from "react";
import type { Currency, Customer, Jurisdiction, ApiPayload, ApiError } from "../types/workspace-resources.js";

type InvoiceRecord = { id: string };
type HookOptions<TInvoice extends InvoiceRecord> = {
  sessionUserId: string;
  tenantId: string;
  role: string;
  setInvoices: Dispatch<SetStateAction<TInvoice[]>>;
  onTenantReset: () => void;
  setNotice: (message: string) => void;
  onCustomersLoaded: (customers: Customer[]) => void;
  onCurrenciesLoaded: (currencies: Currency[]) => void;
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

export function useInvoiceResources<TInvoice extends InvoiceRecord>({
  sessionUserId,
  tenantId,
  role,
  setInvoices,
  onTenantReset,
  setNotice,
  onCustomersLoaded,
  onCurrenciesLoaded,
}: HookOptions<TInvoice>) {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [currencies, setCurrencies] = useState<Currency[]>([]);
  const [jurisdictions, setJurisdictions] = useState<Jurisdiction[]>([]);
  const [jurisdictionId, setJurisdictionId] = useState("");
  const [checkingResources, setCheckingResources] = useState(false);

  useEffect(() => {
    if (!sessionUserId || !tenantId) return;
    onTenantReset();
    setInvoices([]);
    let cancelled = false;

    async function loadResources() {
      setCheckingResources(true);
      setNotice("");
      const canCreateInvoices = ["OWNER", "ADMIN", "FINANCE_MANAGER", "FINANCE_OPERATOR"].includes(role);

      const loadCustomers = async () => readData<{ customers?: Customer[] }>(
        await fetch(`/api/v1/user/tenants/${tenantId}/customers?status=ACTIVE&limit=100`, {
          credentials: "same-origin", cache: "no-store",
        }),
        "Impossible de charger les clients.",
      );
      const loadCurrencies = async () => canCreateInvoices
        ? readData<{ currencies?: Currency[] }>(
            await fetch(`/api/v1/user/tenants/${tenantId}/currencies`, {
              credentials: "same-origin", cache: "no-store",
            }),
            "Impossible de charger les devises.",
          )
        : { currencies: [] as Currency[] };
      const loadJurisdictions = async () => readData<{ jurisdictions?: Jurisdiction[] }>(
        await fetch(`/api/v1/user/tenants/${tenantId}/tax-jurisdictions`, {
          credentials: "same-origin", cache: "no-store",
        }),
        "Impossible de charger les juridictions fiscales.",
      );

      // Each reference API is isolated: one failure must not block the others.
      const [customerResult, currencyResult, jurisdictionResult] = await Promise.allSettled([
        loadCustomers(), loadCurrencies(), loadJurisdictions(),
      ]);
      if (cancelled) return;

      const errors: string[] = [];
      if (customerResult.status === "fulfilled") {
        const loaded = customerResult.value.customers ?? [];
        setCustomers(loaded);
        onCustomersLoaded(loaded);
      } else {
        errors.push(customerResult.reason instanceof Error ? customerResult.reason.message : "Impossible de charger les clients.");
      }

      if (currencyResult.status === "fulfilled") {
        const loaded = currencyResult.value.currencies ?? [];
        setCurrencies(loaded);
        onCurrenciesLoaded(loaded);
      } else {
        errors.push(currencyResult.reason instanceof Error ? currencyResult.reason.message : "Impossible de charger les devises.");
      }

      if (jurisdictionResult.status === "fulfilled") {
        const loaded = jurisdictionResult.value.jurisdictions ?? [];
        setJurisdictions(loaded);
        setJurisdictionId((current) => loaded.some((item) => item.id === current) ? current : (loaded[0]?.id ?? ""));
      } else {
        errors.push(jurisdictionResult.reason instanceof Error ? jurisdictionResult.reason.message : "Impossible de charger les juridictions fiscales.");
      }

      if (errors.length) setNotice(errors.join(" "));
      setCheckingResources(false);
    }

    void loadResources().catch((error: unknown) => {
      if (cancelled) return;
      setNotice(error instanceof Error ? error.message : "Impossible de charger les référentiels de facturation.");
      setCheckingResources(false);
    });

    // Invoice loading is independent from customer, currency and tax references.
    void (async () => {
      try {
        const data = await readData<{ invoices?: TInvoice[] }>(
          await fetch(`/api/v1/user/tenants/${tenantId}/invoices?limit=100`, {
            credentials: "same-origin", cache: "no-store",
          }),
          "Impossible de charger les factures.",
        );
        if (!cancelled) setInvoices(data.invoices ?? []);
      } catch (error) {
        if (!cancelled) setNotice(error instanceof Error ? error.message : "Impossible de charger les factures.");
      }
    })();

    return () => { cancelled = true; };
  }, [sessionUserId, tenantId, role, setInvoices, onTenantReset, setNotice, onCustomersLoaded, onCurrenciesLoaded]);

  return { customers, setCustomers, currencies, jurisdictions, jurisdictionId, setJurisdictionId, checkingResources };
}
