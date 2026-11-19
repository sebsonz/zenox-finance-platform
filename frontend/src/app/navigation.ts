export type Page = "dashboard" | "tax" | "invoices" | "commercial-documents" | "customers" | "payments" | "settings" | "platform" | "tax-review";

export const pagePaths: Record<Page, string> = {
  dashboard: "/dashboard",
  tax: "/tax",
  invoices: "/invoices",
  "commercial-documents": "/commercial-documents",
  customers: "/customers",
  payments: "/payments",
  settings: "/settings",
  platform: "/platform",
  "tax-review": "/tax-review",
};

export function pageFromPath(pathname: string): Page {
  const match = Object.entries(pagePaths).find(([, path]) => path === pathname);
  return (match?.[0] as Page | undefined) ?? "dashboard";
}
