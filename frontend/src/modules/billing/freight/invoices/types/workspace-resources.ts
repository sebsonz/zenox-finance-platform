export type Customer = {
  id: string;
  customerCode: string;
  legalName: string;
  displayName: string | null;
  status: "ACTIVE" | "ARCHIVED";
  defaultCurrency: string | null;
};

export type Currency = { code: string; name: string; minorUnit: number };

export type Jurisdiction = {
  id: string;
  code: string;
  countryCode: string;
  name: string;
  level: string;
};

export type ApiError = { error?: { code?: string; message?: string } };
export type ApiPayload<T> = { data?: T } & ApiError;
