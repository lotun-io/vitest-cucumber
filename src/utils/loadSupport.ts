import { AfterStep } from "@cucumber/cucumber";
import { glob } from "glob";
import type { VitestCucumberGlobal } from "../types/global.ts";

const { moduleLoader, config, testCaseErrors } =
  global.__vitestCucumber as VitestCucumberGlobal;

delete global.__vitestCucumber;

// Capture testCase errors
AfterStep(function ({ testCaseStartedId, error }) {
  if (error) {
    testCaseErrors.set(testCaseStartedId, error);
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
      : ["features/**/*.{ts,js,cjs,mjs}"]
    ).map((pattern) => glob(pattern, globOpts)),
  ).then((r) => r.flat()),
]);

for (const path of resolvedRequirePaths) {
  await moduleLoader(path);
}
for (const path of resolvedImportPaths) {
  await moduleLoader(path);
}
