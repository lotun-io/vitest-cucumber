import type { IConfiguration } from "@cucumber/cucumber/api";
import path from "node:path";
import type { Plugin } from "vitest/config";

const cucumberRunner = path.join(
  import.meta.dirname,
  "utils",
  `runner${path.extname(import.meta.filename)}`,
);

export type VitestCucumberOptions = Partial<IConfiguration>;

export const cucumber = (config?: VitestCucumberOptions): Plugin => {
  return {
    name: "vitest-cucumber",
    transform(_: string, id: string) {
      if (!id.endsWith(".feature")) {
        return null;
      }

      return {
        code: `
        import { runFeatureFile } from ${JSON.stringify(cucumberRunner)}
        await runFeatureFile({
          id: ${JSON.stringify(id)},
          config: ${JSON.stringify(config ?? {})},
          moduleLoader: (specifier) => import(specifier)
        });
      `,
        map: null,
      };
    },
  };
};
