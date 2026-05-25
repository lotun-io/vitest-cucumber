import type { Plugin } from "vitest/config";
import type { IConfiguration } from "@cucumber/cucumber/api";
import * as path from "path";

const cucumberRunner = path.join(
  import.meta.dirname,
  "utils",
  `runner${path.extname(import.meta.filename)}`,
);

export const cucumber = (config?: Partial<IConfiguration>): Plugin => {
  return {
    name: "vitest-cucumber",
    transform(code: string, id: string) {
      if (!id.endsWith(".feature")) {
        return null;
      }

      return {
        code: `
        import { runFeatureFile } from ${JSON.stringify(cucumberRunner)}
        runFeatureFile({
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
