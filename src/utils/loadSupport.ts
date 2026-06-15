import { AfterStep } from "@cucumber/cucumber";
import { glob } from "glob";
import type { VitestCucumberGlobal } from "../types/global.ts";

const { moduleLoader, config, testStepErrors } =
  global.__vitestCucumber as VitestCucumberGlobal;

delete global.__vitestCucumber;

// Capture test step error so runCucumber can attach it to the Vitest result.
AfterStep(function ({ testStepId, error }) {
  if (error) {
    testStepErrors.set(testStepId, error);
  }
});

const cwd = process.cwd();

const globOpts = { absolute: true, windowsPathsNoEscape: true, cwd };

const [resolvedRequirePaths, resolvedImportPaths] = await Promise.all([
  Promise.all(
    (config.require ?? []).map((pattern) => glob(pattern, globOpts)),
  ).then((r) => r.flat()),
  Promise.all(
    (config.import?.length
      ? config.import
      : ["features/**/*.{js,ts,cjs,cts,mjs,mts}"]
    ).map((pattern) => glob(pattern, globOpts)),
  ).then((r) => r.flat()),
]);

for (const path of resolvedRequirePaths) {
  await moduleLoader(path);
}
for (const path of resolvedImportPaths) {
  await moduleLoader(path);
}
