import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: { port: 5173, strictPort: true, proxy: { "/api": { target: process.env.FINANCE_API_ORIGIN ?? "http://127.0.0.1:4100", changeOrigin: false } } },
  build: { outDir: "dist", sourcemap: true, cssMinify: false },
});