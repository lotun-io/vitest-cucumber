import type { IConfiguration } from "@cucumber/cucumber";
import { glob } from "glob";
import type { ModuleLoader } from "./runner.ts";

const { moduleLoader, config } = global.__vitestCucumber as {
  moduleLoader: ModuleLoader;
  config: Partial<IConfiguration>;
};

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
