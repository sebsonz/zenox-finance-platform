export type Page = "dashboard" | "tax" | "invoices" | "payments" | "settings" | "platform";

export const pagePaths: Record<Page, string> = {
  dashboard: "/dashboard",
  tax: "/tax",
  invoices: "/invoices",
  payments: "/payments",
  settings: "/settings",
  platform: "/platform",
};

export function pageFromPath(pathname: string): Page {
  const match = Object.entries(pagePaths).find(([, path]) => path === pathname);
  return (match?.[0] as Page | undefined) ?? "dashboard";
}
