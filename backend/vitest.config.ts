import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Only source-controlled TypeScript tests are eligible for discovery.
    // The TypeScript build emits JavaScript under dist/, which must never be
    // rediscovered as a second copy of the same test suite.
    include: ["tests/**/*.test.ts"],
    exclude: ["node_modules/**", "dist/**", "coverage/**"],
    environment: "node",
  },
});
