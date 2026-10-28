import { createBrowserRouter, Navigate } from "react-router";
import { App } from "./App.js";

export const router = createBrowserRouter([
  {
    path: "/",
    Component: App,
    children: [
      { index: true },
      { path: "dashboard" },
      { path: "invoices" },
      { path: "payments" },
      { path: "tax" },
      { path: "settings" },
      { path: "platform" },
    ],
  },
  {
    path: "*",
    element: <Navigate to="/dashboard" replace />,
  },
]);
