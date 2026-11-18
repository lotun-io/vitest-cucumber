// The unit project's global setup: what the plugin provides its workers (no plugin runs in the unit
// project), since the page's modules read it as they load (`worker/cucumber/page.ts`'s `version`).
import type { TestProject } from "vitest/node";
import type {} from "../types/providedContext.ts";

export default ({ provide }: TestProject) => {
  provide("vitestCucumber", {
    colors: false,
    totalWorkers: 1,
    isolate: true,
    version: "0.0.0-unit",
    // A tag defined with a timeout (`worker/platform/__tests__/scenarioTestOptions.test.ts`).
    timedTags: ["@slow"],
    // Vitest's defaults in node mode; `testTimeout` 0, none (`worker/platform/__tests__/vitestTimeouts.test.ts`).
    testTimeout: 0,
    hookTimeout: 10_000,
    internalDirectories: [],
    projectName: "",
    sendMessages: false,
    command: { port: 0, token: "" },
  });
};
