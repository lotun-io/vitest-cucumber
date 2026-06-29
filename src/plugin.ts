import type { IConfiguration } from "@cucumber/cucumber/api";
import path from "node:path";
import type { Plugin, ViteUserConfig } from "vitest/config";
import { createCucumberCommands } from "./browser/commands.ts";
import { resolveSupportGlobs } from "./utils/config.ts";

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

export type VitestCucumberOptions = Partial<IConfiguration>;

const isBrowserEnabled = (config: ViteUserConfig): boolean =>
  Boolean(config.test?.browser?.enabled);

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
const browserCucumber = (config?: VitestCucumberOptions): Plugin => {
  // Resolve the effective config ONCE at transform time so the page glob is
  // profile-aware: `resolveSupportGlobs` applies CUCUMBER_OPTIONS + named
  // profiles and returns the resolved support-code globs split by `import`/
  // `require`. We map their union to Vite root-relative patterns ("/foo/**", so
  // they resolve from the project root) and bake the literal into the wrapper's
  // `import.meta.glob` (Vite requires a static literal). Memoised so the config
  // file is read once, not per `.feature`. NOTE: because the glob is fixed at
  // transform time, changing profiles/config needs a re-run.
  let globsPromise: Promise<string[]> | undefined;
  const resolveGlobs = (): Promise<string[]> =>
    (globsPromise ??= resolveSupportGlobs(config ?? {}).then(
      ({ import: importGlobs, require: requireGlobs }) =>
        [...importGlobs, ...requireGlobs].map(
          (pattern) => "/" + pattern.replace(/^\.?\//, ""),
        ),
    ));

  return {
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
    async transform(code, id) {
      if (!id.endsWith(".feature")) {
        return null;
      }
      // Thin wrapper (mirrors the Node branch). The eager glob loads step/support
      // files IN THE BROWSER for their registration side effects; all
      // orchestration lives in runnerBrowser's runFeatureFile. The glob list is
      // resolved (profile-aware) at transform time and baked as a literal.
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

// Returns both mode-specific plugins; each self-selects via `apply` based on
// whether the resolved (project) config enables Vitest browser mode. Vite
// flattens the nested array, so `plugins: [cucumber(...)]` works as before.
export const cucumber = (config?: VitestCucumberOptions): Plugin[] => [
  nodeCucumber(config),
  browserCucumber(config),
];
