import type { IConfiguration } from "@cucumber/cucumber/api";
import path from "node:path";
import type { Plugin, ViteUserConfig } from "vitest/config";
import { createCucumberCommands } from "./browser/commands.ts";
import { mergeConfig, resolveSupportGlobs } from "./utils/config.ts";
import { ensurePublishDir, PUBLISH_DIR_ENV } from "./utils/publish.ts";

const ext = path.extname(import.meta.filename);
const nodeRunnerPath = path.join(import.meta.dirname, "node", `runner${ext}`);
const publishGlobalSetupPath = path.join(
  import.meta.dirname,
  "utils",
  `publishGlobalSetup${ext}`,
);
const browserRunnerPath = path.join(
  import.meta.dirname,
  "browser",
  `runner${ext}`,
);
const browserCucumberShimPath = path.join(
  import.meta.dirname,
  "browser",
  `cucumberShim${ext}`,
);

export type VitestCucumberOptions = Partial<IConfiguration>;

const isBrowserEnabled = (config: ViteUserConfig): boolean =>
  Boolean(config.test?.browser?.enabled);

const nodeCucumber = (config?: VitestCucumberOptions): Plugin => {
  return {
    name: "vitest-cucumber:node",
    enforce: "pre",
    apply: (userConfig) => !isBrowserEnabled(userConfig),
    async config() {
      const mergedConfig = await mergeConfig(config ?? {});
      const publishDir = ensurePublishDir(mergedConfig.publish);

      return {
        test: {
          globalSetup: [publishGlobalSetupPath],
          ...(publishDir && { env: { [PUBLISH_DIR_ENV]: publishDir } }),
        },
      };
    },
    transform(code, id) {
      if (!id.endsWith(".feature")) {
        return null;
      }
      return {
        code: `
        import { runFeatureFile } from ${JSON.stringify(nodeRunnerPath)}
        await runFeatureFile({
          id: ${JSON.stringify(id)},
          config: ${JSON.stringify(config ?? {})},
          moduleLoader: (specifier) => import(specifier),
        });
      `,
        map: null,
      };
    },
  };
};

const browserCucumber = (config?: VitestCucumberOptions): Plugin => {
  let globsPromise: Promise<string[]> | undefined;
  const resolveGlobs = (): Promise<string[]> =>
    (globsPromise ??= resolveSupportGlobs(config ?? {}).then((globs) =>
      globs.map((pattern) => "/" + pattern.replace(/^\.?\//, "")),
    ));

  return {
    name: "vitest-cucumber:browser",
    enforce: "pre",
    apply: (userConfig) => isBrowserEnabled(userConfig),

    async config() {
      const mergedConfig = await mergeConfig(config ?? {});
      const publishDir = ensurePublishDir(mergedConfig.publish);

      return {
        optimizeDeps: {
          exclude: ["@cucumber/cucumber"],
        },
        test: {
          globalSetup: [publishGlobalSetupPath],
          ...(publishDir && { env: { [PUBLISH_DIR_ENV]: publishDir } }),
          browser: {
            commands: createCucumberCommands(config ?? {}),
          },
        },
      };
    },
    resolveId(source, _importer, options) {
      // Redirect to the browser shim in the page realm only (not ssr/Node).
      if (source === "@cucumber/cucumber" && !options?.ssr) {
        return browserCucumberShimPath;
      }
      return null;
    },
    async transform(code, id) {
      if (!id.endsWith(".feature")) {
        return null;
      }
      const globs = await resolveGlobs();
      return {
        code: `
        import { runFeatureFile } from ${JSON.stringify(browserRunnerPath)}
        const steps = import.meta.glob(${JSON.stringify(globs)}, { eager: true });
        await runFeatureFile({
          id: ${JSON.stringify(id)},
          steps
        });
      `,
        map: null,
      };
    },
  };
};

export const cucumber = (config?: VitestCucumberOptions): Plugin[] => [
  nodeCucumber(config),
  browserCucumber(config),
];
