// The repository's own helpers for its Vitest configs (`./vitest.config.ts`,
// `./storybook/vite.config.ts`), so the config itself only describes the projects: the plugin's
// sources (`sourceDir`, `sourcePattern`), what the command asks for (`failFeaturesSkipped`,
// `isPartialRun`), the workers' allocators (`allocatorEnv`), the fix of v8 coverage for the plugin's
// modules (`nodeSourceCoverage`), the e2e and compatibility projects' workers (`e2eMaxWorkers`).
// None of it is the plugin's.
import { slash } from "@vitest/utils/helpers";
import { transformSync } from "amaro";
import { readFile } from "node:fs/promises";
import os from "node:os";
import { fileURLToPath } from "node:url";
import type { Plugin } from "vitest/config";

/** The plugin's sources, as Vitest writes its ids: with `/`, on Windows too. */
export const sourceDir = `${slash(import.meta.dirname)}/src/`;

/** The plugin's modules, by id (`server.deps.external`: loaded by Node, as its users' are). */
export const sourcePattern = new RegExp(`^${RegExp.escape(sourceDir)}`);

/**
 * Whether `features/fail/` is left out: its scenarios fail on purpose, so they run only when the
 * command names them, e.g. `pnpm test --project node features/fail/summaries.feature`.
 */
export const failFeaturesSkipped = !process.argv.some((arg) =>
  arg.includes("features/fail/"),
);

/**
 * Whether the command runs part of the suite only (a project, a file, a test name: any argument
 * that isn't an option, as `pnpm test --project cck`): its coverage is printed, the thresholds are
 * the whole suite's.
 */
export const isPartialRun = process.argv
  .slice(2)
  .some((arg) => arg !== "run" && !arg.startsWith("-"));

/**
 * Every project's workers' environment as Vitest forks them: their memory allocators return freed
 * memory to the system right away (read as a process starts). Rolldown's mimalloc (Vite's
 * dependency bundling, its parsers) otherwise keeps freed pages for reuse, glibc's malloc (Node,
 * other native modules) its arenas: measured on an e2e worker (`filters.feature`), with the forced
 * collection after each closed Vitest (the e2e projects' `--expose-gc`), ~1.0 GB without them, ~0.7
 * GB with them.
 */
export const allocatorEnv = {
  MIMALLOC_PURGE_DELAY: "0",
  MIMALLOC_PURGE_DECOMMITS: "1",
  MIMALLOC_ARENA_EAGER_COMMIT: "0",
  MALLOC_ARENA_MAX: "2",
  MALLOC_TRIM_THRESHOLD_: "131072",
};

// This repository's fix of Vitest's v8 coverage for the plugin's modules (`./vitest.config.ts`: `nodeSourceCoverage`).
// They run as Node loads them (`server.deps.external`, its types stripped, their positions kept),
// but coverage maps each file through its server's transform of it, Vite's (other positions:
// counts on other lines). For them, the server's `ssr` environment transforms as Node does: Vitest's
// runner never fetches them (external), so only coverage gets it. A page runs them as Node does too
// (`client`: Node's stripping, not Vite's TypeScript transform): with Vite's, a page's copy of a
// file never merged with Node's (its map leaves each function's end unmapped, column `null`, and
// the report keys a function by its start and end), so each function counted twice, once uncovered.
// The stripping is `amaro`'s, the library Node strips types with (`stripTypeScriptTypes` of
// `node:module` is the same, but experimental: it warns as it's first called).
/** `code` without its types, as Node strips them (types as spaces, positions kept). */
const stripTypeScriptTypes = (code: string) =>
  transformSync(code, { mode: "strip-only" }).code;

/** `url`'s file, with `/` (as Vite's ids): without its query, a `file:` URL's path. */
const fileOf = (url: string) => {
  const [pathname = ""] = url.split("?");
  return slash(
    pathname.startsWith("file://") ? fileURLToPath(pathname) : pathname,
  );
};

export const nodeSourceCoverage = (directory: string): Plugin => {
  // With `/`, as Vite's ids: on Windows a directory made with `node:path` has `\\`, and matched
  // no module (a page then got Vite's transform, its functions and branches counted twice).
  const sources = new RegExp(
    `^${RegExp.escape(slash(directory))}.*\\.[cm]?ts$`,
  );
  /** Whether `file` is one of the plugin's TypeScript modules. */
  const isSource = (file: string) => sources.test(file);
  return {
    name: "repo:node-source-coverage",
    // Before Vite's own transforms: a page gets Node's stripping (types as spaces, positions kept).
    enforce: "pre",
    // Vite's TypeScript transform leaves them alone (plain JavaScript by then), React Refresh's too:
    // React's plugin has it run on every `*.[tj]sx?` (`jsxRefreshInclude`), despite `exclude`. Only
    // where Refresh is on, after the other plugins' config: an exclude without an include has it run
    // on everything else, CSS too.
    config: {
      order: "post",
      handler: ({ oxc }) => ({
        oxc: {
          exclude: sources,
          ...(oxc &&
            oxc.jsxRefreshInclude !== undefined && {
              jsxRefreshExclude: [
                ...[oxc.jsxRefreshExclude ?? []].flat(),
                sources,
              ],
            }),
        },
      }),
    },
    transform(code, id) {
      if (this.environment.name !== "client" || !isSource(fileOf(id))) {
        return undefined;
      }
      return { code: stripTypeScriptTypes(code), map: null };
    },
    configureServer(server) {
      const environment = server.environments.ssr;
      if (!environment) {
        return;
      }
      const { transformRequest } = environment;
      environment.transformRequest = async function (url, ...rest) {
        const file = fileOf(url);
        if (isSource(file)) {
          return {
            code: stripTypeScriptTypes(await readFile(file, "utf8")),
            map: null,
          };
        }
        return transformRequest.call(this, url, ...rest);
      };
    },
  };
};

// The e2e and compatibility projects' workers (e2e's `isolate: true`: a process per feature file,
// the native memory its Vitests leave behind given back as it ends; cck's `isolate: false`): each
// keeps a Vitest per mode for the default config (`e2e/support/kept.ts`), runs any other in a new
// Vitest closed after it (`e2e/support/runVitest.ts`), one scenario's at a time. A worker drives
// more than its own process (a nested Vitest's pages in the run's Chromium, Storybook's builds and
// dev servers, Rolldown's threads): too many overload a machine (workers fail to start, imports
// fail, steps time out), and Vitest's default (a CPU thread each, but one) runs out of memory
// first. So the default is the smaller of half the machine's CPU threads (a worker keeps about two
// busy: itself, and its nested Vitest's worker or page, Chromium's renderer, Rolldown's threads;
// whatever the CPU's layout, which Node doesn't tell) and what its free memory holds as the run
// starts (`os.freemem()`: Linux's `MemAvailable`, what's left with the system's and other programs'
// share taken, the page cache counted free): a worker's processes ~2 GB at most, past ~2 GB for the
// run's own (Vitest's main process, Chromium; measured 2026-11-24: one worker's whole run 3.3 GB at
// most). `E2E_WORKERS` (a number) sets them, e.g. `E2E_WORKERS=2 pnpm test`. CI runs them in its
// whole-suite run (`.github/workflows/ci.yml`).
const gigabyte = 2 ** 30;
export const e2eMaxWorkers = process.env.E2E_WORKERS
  ? Number(process.env.E2E_WORKERS)
  : Math.max(
      1,
      Math.min(
        Math.floor(os.availableParallelism() / 2),
        Math.floor((os.freemem() - 2 * gigabyte) / (2 * gigabyte)),
      ),
    );
