import type { IConfiguration } from "@cucumber/cucumber";
import { AfterStep } from "@cucumber/cucumber";
import { glob } from "tinyglobby";
import { resolveSupportGlobs } from "../utils/config.ts";
import { globalRef } from "../utils/globals.ts";
import type { SerializedError } from "../utils/serializeError.ts";
import { serializeError } from "../utils/serializeError.ts";
import type { ModuleLoader } from "./runner.ts";

export type NodeSupport = {
  moduleLoader: ModuleLoader;
  config: Partial<IConfiguration>;
  testStepErrors: Map<string, SerializedError>;
};

/* v8 ignore start */
const support = globalRef.__vitest_cucumber_node__?.support;

if (!support) {
  throw new Error(
    "Node support not found on globalThis.__vitest_cucumber_node__.support",
  );
}

// Capture test step error so runCucumber can attach it to the Vitest result.
AfterStep(function ({ testStepId, error }) {
  if (error) {
    support.testStepErrors.set(testStepId, serializeError(error));
  }
});
/* v8 ignore stop */

const cwd = process.cwd();

const globOpts = { absolute: true, cwd };

const supportGlobs = await resolveSupportGlobs(support.config);
const resolvedImportPaths = await glob(supportGlobs, globOpts);

for (const path of resolvedImportPaths) {
  await support.moduleLoader(path);
}
