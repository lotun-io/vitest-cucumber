import { cucumber } from "@lotun/vitest-cucumber";
import { playwright } from "@vitest/browser-playwright";
import path from "node:path";
import { defineConfig } from "vitest/config";
import {
  allocatorEnv,
  e2eMaxWorkers,
  failFeaturesSkipped,
  isPartialRun,
  nodeSourceCoverage,
  sourceDir,
  sourcePattern,
  virtualFeatureStories,
} from "./vitest.utils.ts";

export default defineConfig({
  // `src/`'s coverage as Node runs it (see `./vitest.utils.ts`'s `nodeSourceCoverage`).
  plugins: [nodeSourceCoverage(sourceDir)],
  // The e2e scenarios' projects (`tmp/e2e/`) and the fixtures: their configs and `package.json`
  // files are Vitest's rerun triggers, a watched run would rerun on its own.
  server: {
    watch: {
      ignored: ["**/tmp/**"],
    },
  },
  test: {
    reporters: ["default"],
    environment: "node",
    // The workers' allocators return freed memory at once (see `./vitest.utils.ts`).
    env: allocatorEnv,
    // Every e2e scenario runs Vitest on a project of its own. Vitest's reporters only read the
    // root config's threshold, not a project's.
    slowTestThreshold: 10_000,
    // The plugin's modules, loaded by Node as its users' are (in `node_modules`, Vitest externalizes
    // them): `src/` is outside `node_modules`, Vitest would inline them. Every project inherits it.
    server: {
      deps: {
        external: [sourcePattern],
      },
    },
    coverage: {
      provider: "v8",
      reportsDirectory: "coverage",
      include: ["src/**/*.ts"],
      exclude: ["src/**/__*__/**"],
      ...(!isPartialRun && {
        thresholds: {
          statements: 90,
          branches: 80,
          functions: 90,
          lines: 90,
        },
      }),
      autoAttachSubprocess: true,
    },
    projects: [
      {
        test: {
          name: "unit",
          sequence: {
            groupOrder: 0,
          },
          include: [
            "src/**/__tests__/**/*.test.ts",
            "compatibility/**/__tests__/**/*.test.ts",
          ],
          // What the plugin provides its workers (here none runs it).
          globalSetup: ["src/__tests__/provide.ts"],
        },
      },
      {
        plugins: [
          cucumber({
            import: ["features/support/**/*.ts", "features/steps/**/*.ts"],
          }),
        ],
        test: {
          name: "node",
          sequence: {
            groupOrder: 1,
          },
          include: ["features/**/*.feature"],
          exclude: failFeaturesSkipped ? ["features/fail/**"] : undefined,
        },
      },
      {
        plugins: [
          cucumber({
            import: ["features/support/**/*.ts", "features/steps/**/*.ts"],
          }),
        ],
        test: {
          name: "browser",
          sequence: {
            groupOrder: 2,
          },
          include: ["features/**/*.feature"],
          exclude: failFeaturesSkipped ? ["features/fail/**"] : undefined,
          browser: {
            enabled: true,
            provider: playwright(),
            instances: [
              {
                browser: "chromium",
              },
            ],
            headless: true,
            screenshotFailures: false,
          },
        },
      },
      {
        // The repo's features as Storybook stories (`storybook/vite.config.ts`: each scenario a
        // story, made as Vitest loads them), with their own support code, as `node` and `browser` run
        // them. Its name given again: an extended file's isn't the project's.
        extends: "./storybook/vite.config.ts",
        // Its features' stories files, virtual (see `./vitest.utils.ts`'s `virtualFeatureStories`).
        plugins: [
          virtualFeatureStories(path.join(import.meta.dirname, "features")),
        ],
        test: {
          name: "storybook",
          // Storybook's `beforeAll` (cucumber's BeforeAll and AfterAll) runs for every stories file,
          // even one whose stories its tags skip: `features/fail/`'s hooks, failing on purpose, would
          // fail the run. Left out unless the command names them, as in `node` and `browser`.
          exclude: failFeaturesSkipped ? ["../features/fail/**"] : undefined,
          sequence: {
            groupOrder: 3,
          },
        },
      },
      {
        // Scenarios that each run Vitest on a project of their own (see `e2e/support/world.ts`).
        plugins: [
          cucumber({
            import: ["e2e/support/**/*.ts", "e2e/steps/**/*.ts"],
          }),
        ],
        test: {
          name: "e2e",
          // A scenario's steps and hooks (cucumber's timeouts, Vitest's by default): a nested run
          // starts its own Vite server, workers or browser.
          testTimeout: 90_000,
          hookTimeout: 90_000,
          // A scenario that fails because of a known bug (e.g. Vitest's, reported upstream): it
          // passes while it fails, and fails once the bug is fixed (its tag then removed). Retried:
          // a bug that's a race sometimes lets a run pass.
          tags: [
            {
              name: "@knownFailure",
              fails: true,
              retry: 2,
              description: "Fails because of a known bug",
            },
          ],
          sequence: {
            groupOrder: 4,
          },
          maxWorkers: e2eMaxWorkers,
          include: ["e2e/*.feature"],
          // Collects the garbage after each nested Vitest closes (`collectGarbage`, `e2e/support/run.ts`):
          // the native memory its objects hold goes back then, not as V8 gets round to it.
          execArgv: ["--expose-gc"],
          globalSetup: ["e2e/support/chromium.ts"],
        },
      },
      {
        // Cucumber's compatibility kit, last: a feature file per sample of the kit
        // (`pnpm compatibility:generate`: `compatibility/utils/generate.ts`), each sample run with native
        // cucumber and with the plugin in each mode on e2e's harness (its support code, its runs), and
        // compared (`compatibility/steps/`). Known differences: `compatibility/utils/known.ts`.
        plugins: [
          cucumber({
            import: [
              "e2e/support/**/*.ts",
              "e2e/steps/**/*.ts",
              "compatibility/steps/**/*.ts",
            ],
          }),
        ],
        test: {
          name: "cck",
          // One worker process for many samples (not one per feature file, as e2e's): its kept
          // Vitests (a mode's each) serve every sample's rows, the memory staying flat (measured
          // 2026-11-24: 126 rows, one worker, 2.0 GB at most throughout; 130 s against 203 s
          // isolated, before the kept Vitests served them).
          isolate: false,
          testTimeout: 90_000,
          hookTimeout: 90_000,
          // As e2e's: a known difference passes while it fails (its reason the example's name); a
          // sample left out is skipped (its reason the feature's description).
          tags: [
            {
              name: "@knownFailure",
              fails: true,
              retry: 2,
              description: "Fails because of a known difference",
            },
            { name: "@leftOut", skip: true },
          ],
          sequence: {
            groupOrder: 5,
          },
          maxWorkers: e2eMaxWorkers,
          include: ["compatibility/*.feature"],
          // Collects the garbage after each nested Vitest closes (`collectGarbage`, `e2e/support/run.ts`):
          // the native memory its objects hold goes back then, not as V8 gets round to it.
          execArgv: ["--expose-gc"],
          globalSetup: ["e2e/support/chromium.ts"],
        },
      },
    ],
  },
});
