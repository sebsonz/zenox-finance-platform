import { createBrowserRouter } from "react-router";
import { NotFoundPage } from "./NotFoundPage.js";
import { App } from "./App.js";

export const router = createBrowserRouter([
  {
    path: "/",
    Component: App,
    children: [
      { index: true },
      { path: "dashboard" },
      { path: "invoices" },
      { path: "customers" },
      { path: "payments" },
      { path: "tax" },
      { path: "settings" },
      { path: "platform" },
    ],
  },
  {
    path: "*",
    Component: NotFoundPage,
  },
]);
