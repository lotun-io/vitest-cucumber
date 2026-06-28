import type { IConfiguration } from "@cucumber/cucumber/api";
import path from "node:path";
import type { Plugin, ViteUserConfig } from "vitest/config";
import { createCucumberCommands } from "./browser/commands.ts";

const ext = path.extname(import.meta.filename);
const nodeRunnerPath = path.join(import.meta.dirname, "node", `runner${ext}`);
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
const lifecycleFeaturePath = path.join(
  import.meta.dirname,
  "features",
  "lifecycle.feature",
);

export type VitestCucumberOptions = Partial<IConfiguration>;

const isBrowserEnabled = (config: ViteUserConfig): boolean =>
  Boolean(config.test?.browser?.enabled);

const toRootGlob = (pattern: string): string =>
  "/" + pattern.replace(/^\.?\//, "");

// Node-mode plugin: transforms each `.feature` into a `runnerNode` invocation.
// Applies only when the (project) config does NOT enable browser mode.
const nodeCucumber = (config?: VitestCucumberOptions): Plugin => ({
  name: "vitest-cucumber:node",
  enforce: "pre",
  apply: (userConfig) => !isBrowserEnabled(userConfig),
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
          lifecycleFeaturePath: ${JSON.stringify(lifecycleFeaturePath)}
        });
      `,
      map: null,
    };
  },
});

// Browser-mode plugin: registers the Node-side Cucumber commands, redirects
// "@cucumber/cucumber" to the registry shim in the browser realm, and transforms
// each `.feature` into a `runnerBrowser` invocation. Applies only when the
// (project) config enables browser mode.
const browserCucumber = (config?: VitestCucumberOptions): Plugin => ({
  name: "vitest-cucumber:browser",
  enforce: "pre",
  apply: (userConfig) => isBrowserEnabled(userConfig),
  config() {
    // Register the Node-side command that runs the native Cucumber runner and
    // keep the optimizer from pre-bundling the real runtime for the browser;
    // resolveId redirects the import to the browser shim instead.
    return {
      optimizeDeps: { exclude: ["@cucumber/cucumber"] },
      test: {
        browser: {
          commands: createCucumberCommands(config ?? {}),
        },
      },
    };
  },
  resolveId(source, _importer, options) {
    // In the BROWSER realm, "@cucumber/cucumber" → registry shim so step bodies
    // (and all their browser-only imports) run there. Step files are never
    // loaded in Node, so nothing to redirect on the Node (ssr) side.
    if (source === "@cucumber/cucumber" && !options?.ssr) {
      return browserCucumberShimPath;
    }
    return null;
  },
  transform(code, id) {
    if (!id.endsWith(".feature")) {
      return null;
    }
    // Thin wrapper (mirrors the Node branch). The eager glob loads step/support
    // files IN THE BROWSER for their registration side effects; all
    // orchestration lives in runnerBrowser's runFeatureFile.
    const globs = (config?.import ?? []).map(toRootGlob);
    return {
      code: `
        import { runFeatureFile } from ${JSON.stringify(browserRunnerPath)}
        const steps = import.meta.glob(${JSON.stringify(globs)}, { eager: true });
        await runFeatureFile({
          id: ${JSON.stringify(id)},
          lifecycleFeaturePath: ${JSON.stringify(lifecycleFeaturePath)},
          steps
        });
      `,
      map: null,
    };
  },
});

// Returns both mode-specific plugins; each self-selects via `apply` based on
// whether the resolved (project) config enables Vitest browser mode. Vite
// flattens the nested array, so `plugins: [cucumber(...)]` works as before.
export const cucumber = (config?: VitestCucumberOptions): Plugin[] => [
  nodeCucumber(config),
  browserCucumber(config),
];
