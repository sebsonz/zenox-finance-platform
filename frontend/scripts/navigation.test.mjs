import assert from "node:assert/strict";
import test from "node:test";
import { pageFromPath, pagePaths } from "../src/app/navigation.ts";

test("every declared page resolves from its canonical path", () => {
  for (const [page, path] of Object.entries(pagePaths)) {
    assert.equal(pageFromPath(path), page, `Expected ${path} to resolve to ${page}`);
  }
});

test("page paths are unique", () => {
  const paths = Object.values(pagePaths);
  assert.equal(new Set(paths).size, paths.length);
});

test("unknown paths use the dashboard fallback", () => {
  assert.equal(pageFromPath("/not-a-real-page"), "dashboard");
});
