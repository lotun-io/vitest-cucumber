/**
 * Unit tests for node/loadSupport.ts.
 *
 * loadSupport.ts is a top-level-await module loaded by Cucumber's native
 * loadSupport() API (a plain Node ESM import, not through Vitest's module
 * runner). That import bypasses Vitest's transform pipeline, so v8 coverage
 * cannot attribute execution to those lines. Importing the module here directly
 * — through Vitest — gives the coverage provider the instrumented version and
 * covers the previously-dark lines (16, 38-41).
 *
 * vi.resetModules() is used between tests so the top-level-await body
 * re-evaluates with a fresh globalThis state each time.
 */

import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { globalRef } from "../../utils/globals.ts";
import type { SerializedError } from "../../utils/serializeError.ts";

// Stub Cucumber's AfterStep so the module-level hook registration is a no-op:
// without this, loadSupport.ts needs a live Cucumber supportCodeLibraryBuilder.
vi.mock("@cucumber/cucumber", () => ({
  AfterStep: vi.fn(),
}));

describe("node/loadSupport", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    delete globalRef.__vitest_cucumber_node__;
  });

  it("calls moduleLoader for every file matched by the support globs", async () => {
    const loaded: string[] = [];
    const testStepErrors = new Map<string, SerializedError>();

    // Point the import glob at the repo's real features/support directory,
    // which has real .ts files for glob to resolve.
    globalRef.__vitest_cucumber_node__ = {
      support: {
        moduleLoader: async (specifier: string) => {
          loaded.push(specifier);
        },
        config: {
          import: [
            path.join(import.meta.dirname, "../../../features/support/**/*.ts"),
          ],
        },
        testStepErrors,
      },
    };

    await import("../loadSupport.ts");

    expect(loaded.length).toBeGreaterThan(0);
    expect(loaded.every((p) => p.endsWith(".ts"))).toBe(true);
  });
});
