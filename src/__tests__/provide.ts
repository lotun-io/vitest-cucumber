// The unit project's global setup: what the plugin provides its workers (no plugin runs in the unit
// project), since the page's modules read it as they load (`worker/cucumber/page.ts`'s `version`).
// As a node-mode run would have it (Vitest's defaults, no tag defined with a timeout); a test that
// needs another value sets it for its own file (`./withProvided.ts`).
import type { TestProject } from "vitest/node";
import type {} from "../types/providedContext.ts";

export default ({ provide }: TestProject) => {
  provide("vitestCucumber", {
    colors: false,
    totalWorkers: 1,
    isolate: true,
    version: "0.0.0-unit",
    timedTags: [],
    // Vitest's defaults in node mode.
    testTimeout: 5_000,
    hookTimeout: 10_000,
    internalDirectories: [],
    projectName: "",
    sendMessages: false,
    command: { port: 0, token: "" },
  });
};
