import { cucumber } from "@lotun/vitest-cucumber";
import { playwright } from "@vitest/browser-playwright";
import { slash } from "@vitest/utils/helpers";
import path from "node:path";
import { defineConfig } from "vitest/config";
import { nodeSources } from "./vitest.nodeSources.ts";
import { virtualStories } from "./vitest.virtualStories.ts";

// As Vitest writes its ids: with `/`, on Windows too.
const srcPath = `${slash(import.meta.dirname)}/src/`;

const src = new RegExp(`^${RegExp.escape(srcPath)}`);
// `features/fail/`'s scenarios fail on purpose: they run only when the command names them (left
// out of each project's files otherwise), e.g.
// `pnpm test --project node features/fail/summaries.feature`.
const skipFail = !process.argv.some((arg) => arg.includes("features/fail/"));
// Part of the suite only (a project, a file, a test name: any argument that isn't an option, as
// `pnpm test --project cck`): its coverage is printed, the thresholds are the whole suite's.

const partial = process.argv
  .slice(2)
  .some((arg) => arg !== "run" && !arg.startsWith("-"));

// The e2e and compatibility projects' workers (`isolate: true`: a process per feature file, the
// native memory its Vitests leave behind given back as it ends): each keeps a Vitest per mode for the
// default config (`e2e/support/kept.ts`), runs any other in a new Vitest closed after it
// (`e2e/support/runVitest.ts`), one scenario's at a time. GitHub's runner: 16 GB, 4 CPUs.
// `E2E_WORKERS` (a number) sets them, e.g. `E2E_WORKERS=2 pnpm test` on a smaller machine.
const e2eWorkers = process.env.E2E_WORKERS
  ? Number(process.env.E2E_WORKERS)
  : process.env.CI
    ? 6
    : undefined;

export default defineConfig({
  // `src/`'s coverage as Node runs it (see `./vitest.nodeSources.ts`).
  plugins: [nodeSources(srcPath)],
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
    // Every project's workers' environment as Vitest forks them: their memory allocators return
    // freed memory to the system right away (read as a process starts). Rolldown's mimalloc (Vite's
    // dependency bundling, its parsers) otherwise keeps freed pages for reuse, glibc's malloc (Node,
    // other native modules) its arenas: measured on an e2e worker (`filters.feature`), with the
    // forced collection after each closed Vitest (the e2e projects' `--expose-gc`), ~1.0 GB without
    // them, ~0.7 GB with them.
    env: {
      MIMALLOC_PURGE_DELAY: "0",
      MIMALLOC_PURGE_DECOMMITS: "1",
      MIMALLOC_ARENA_EAGER_COMMIT: "0",
      MALLOC_ARENA_MAX: "2",
      MALLOC_TRIM_THRESHOLD_: "131072",
    },
    // Every e2e scenario runs Vitest on a project of its own. Vitest's reporters only read the
    // root config's threshold, not a project's.
    slowTestThreshold: 10_000,
    // The plugin's modules, loaded by Node as its users' are (in `node_modules`, Vitest externalizes
    // them): `src/` is outside `node_modules`, Vitest would inline them. Every project inherits it.
    server: {
      deps: {
        external: [src],
      },
    },
    coverage: {
      provider: "v8",
      reportsDirectory: "coverage",
      include: ["src/**/*.ts"],
      exclude: ["src/**/__*__/**"],
      ...(!partial && {
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
          exclude: skipFail ? ["features/fail/**"] : undefined,
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
          exclude: skipFail ? ["features/fail/**"] : undefined,
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
        // Its features' stories files, virtual (see `./vitest.virtualStories.ts`).
        plugins: [virtualStories(path.join(import.meta.dirname, "features"))],
        test: {
          name: "storybook",
          // Storybook's `beforeAll` (cucumber's BeforeAll and AfterAll) runs for every stories file,
          // even one whose stories its tags skip: `features/fail/`'s hooks, failing on purpose, would
          // fail the run. Left out unless the command names them, as in `node` and `browser`.
          exclude: skipFail ? ["../features/fail/**"] : undefined,
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
          testTimeout: 60_000,
          hookTimeout: 60_000,
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
          maxWorkers: e2eWorkers,
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
          testTimeout: 60_000,
          hookTimeout: 60_000,
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
          maxWorkers: e2eWorkers,
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
