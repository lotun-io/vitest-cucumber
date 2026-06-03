import type { Plugin } from "vitest/config";
import type { IConfiguration } from "@cucumber/cucumber/api";
import path from "node:path";

const cucumberRunner = path.join(
  import.meta.dirname,
  "utils",
  `runner${path.extname(import.meta.filename)}`,
);

export type VitestCucumberOptions = Partial<IConfiguration>;

export const cucumber = (config?: VitestCucumberOptions): Plugin => {
  return {
    name: "vitest-cucumber",
    transform(code: string, id: string) {
      if (!id.endsWith(".feature")) {
        return null;
      }

      return {
        code: `
        import { runFeatureFile } from ${JSON.stringify(cucumberRunner)}
        await runFeatureFile({
          id: ${JSON.stringify(id)},
          code: ${JSON.stringify(code)},
          config: ${JSON.stringify(config ?? {})},
          moduleLoader: (specifier) => import(specifier)
        });
      `,
        map: null,
      };
    },
  };
};
