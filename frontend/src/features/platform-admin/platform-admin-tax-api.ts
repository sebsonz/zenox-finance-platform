export type TaxJurisdictionLevel =
  | "COUNTRY"
  | "STATE"
  | "PROVINCE"
  | "REGION"
  | "CITY"
  | "SPECIAL_ZONE";

export interface PlatformTaxJurisdiction {
  readonly id: string;
  readonly code: string;
  readonly countryCode: string;
  readonly name: string;
  readonly jurisdictionLevel: TaxJurisdictionLevel;
  readonly parentId: string | null;
  readonly isActive: boolean;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface PlatformTaxJurisdictionPage {
  readonly items: PlatformTaxJurisdiction[];
  readonly page: number;
  readonly pageSize: number;
  readonly hasMore: boolean;
}

export interface PlatformTaxJurisdictionFilters {
  readonly countryCode?: string;
  readonly level?: TaxJurisdictionLevel;
  readonly page: number;
  readonly pageSize: number;
}

interface ApiPayload<T> {
  data?: T;
  error?: { message?: string; code?: string };
}

export async function loadPlatformTaxJurisdictions(
  filters: PlatformTaxJurisdictionFilters,
  signal?: AbortSignal,
): Promise<PlatformTaxJurisdictionPage> {
  const params = new URLSearchParams({
    page: String(filters.page),
    pageSize: String(filters.pageSize),
  });
  if (filters.countryCode) params.set("countryCode", filters.countryCode);
  if (filters.level) params.set("level", filters.level);

  const response = await fetch(`/api/v1/user/platform/tax/jurisdictions?${params.toString()}`, {
    credentials: "same-origin",
    cache: "no-store",
    signal,
  });
  const payload = await response.json().catch(() => ({})) as ApiPayload<PlatformTaxJurisdictionPage>;
  if (!response.ok || !payload.data) {
    throw new Error(payload.error?.message ?? "Impossible de charger les juridictions fiscales.");
  }
  return payload.data;
}
