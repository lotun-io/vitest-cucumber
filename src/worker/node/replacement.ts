// Node mode's support code loading, with the plugin's replacement of `@cucumber/cucumber` while it
// loads and cucumber itself after. The replacement has cucumber's exports, the plugin's own where
// the runtime has its own (`own`: the support code's methods recording; `world`, `context`,
// `World`, `DataTable` and `wrapPromiseWithTimeout` the runtime's copies; `Status`,
// `@cucumber/messages`' own enum as cucumber's is; `version`, main's, the installed one's;
// `HookTarget`, the page's, which cucumber's ES module entry forgot), which the support code gets
// both ways: an import through Vitest's mock (`vi.doMock`), a `require` from Node's module cache
// (`require.cache`, cucumber's entry). Then `vi.doUnmock` and cucumber's own entry back, so a later
// import or `require` is cucumber's own; the support modules keep what they got: a definition they
// make later fails (`../cucumber/registry.ts`).
//
// Cucumber's own code is loaded only as an export only it has is read (its formatters, its
// library builder, …): its import is 57 ms and 23 MB in every worker, which with Vitest's
// `isolate` is every feature file (measured 2026-11-25: `notes/analysis-2026-11.md`, "Performance").
// The exports' names are the installed cucumber's, read from its two entries' text, each way's its
// own (`./cucumberExports.ts`: what an `import` has, what a `require` has), with the plugin's own;
// each is a getter: the plugin's own without cucumber, any other cucumber's, loaded then (a
// `require`: synchronous, past the stand-in entry a `require` of it gets while the support code
// loads). Where the names can't be read (an entry written another way, a cucumber that can't be
// `require`d), cucumber is loaded first, as it was before: its exports with the plugin's own over
// them.
import { TestStepResultStatus } from "@cucumber/messages";
import Module, { createRequire } from "node:module";
import { inject, vi } from "vitest";
import type {} from "../../types/providedContext.ts";
import { pluginError } from "../../utils/errors.ts";
import { DataTable } from "../cucumber/dataTable.ts";
import { HookTarget } from "../cucumber/page.ts";
import { context, world } from "../cucumber/scope.ts";
import { World } from "../cucumber/world.ts";
import { wrapPromiseWithTimeout } from "../runner/timeout.ts";
import { cucumberExports, type CucumberExports } from "./cucumberExports.ts";

const require = createRequire(import.meta.url);

/** Cucumber's replacement while the support code loads. */
interface Replacement {
  /** What an import of `@cucumber/cucumber` gets. */
  exports: object;
  /** The support code loaded: a later `require` is cucumber's own. */
  restore(): void;
}

/**
 * Cucumber loaded first: its exports with `own` over them, and for a `require` its entry in
 * Node's module cache (if its package can be required: its `exports` has `require`), its
 * `exports` swapped for those (cucumber's code keeps its own object).
 */
const loadedReplacement = async (
  own: Record<string, unknown>,
): Promise<Replacement> => {
  const exports = { ...(await import("@cucumber/cucumber")), ...own };
  let entry: NodeJS.Module | undefined;
  try {
    const file = require.resolve("@cucumber/cucumber");
    require(file);
    entry = require.cache[file];
  } catch {
    // It can't be required: an import is the only way to it.
  }
  const cucumbers: unknown = entry?.exports;
  if (entry) {
    entry.exports = exports;
  }
  return {
    exports,
    restore: () => {
      if (entry) {
        entry.exports = cucumbers;
      }
    },
  };
};

/**
 * Cucumber loaded only as it's needed: each of its exports' names (`imported`, `required`: each
 * way's own) and `own`'s a getter, `own`'s where it has one, else cucumber's, `require`d as it's
 * first read. (Exported for its test: the suite's test files are Node's to load, where Vitest's
 * mock of an import doesn't apply.)
 */
export const lazyReplacement = (
  own: Record<string, unknown>,
  { imported, required }: CucumberExports,
): Replacement => {
  const { file } = required;
  /** A `require`'s stand-in for cucumber's entry in Node's module cache. */
  const standIn = new Module(file);
  standIn.loaded = true;
  /** Whether the support code still loads (a `require` of cucumber gets the stand-in). */
  let loading = true;
  /** Cucumber's own entry, once its code is loaded (already, if something loaded it before). */
  let cucumbers = require.cache[file];
  /** Cucumber's own exports: its code loaded now, past the stand-in, if it wasn't. */
  const cucumber = (): Record<string, unknown> => {
    if (!cucumbers) {
      Reflect.deleteProperty(require.cache, file);
      require(file);
      cucumbers = require.cache[file];
      if (loading) {
        require.cache[file] = standIn;
      }
    }
    if (!cucumbers) {
      throw pluginError("cucumber didn't load", { internal: true });
    }
    return cucumbers.exports;
  };
  /** An object with `names` and `own`'s, each a getter. */
  const exportsOf = (names: readonly string[]) => {
    const exports = {};
    for (const name of new Set([...names, ...Object.keys(own)])) {
      Object.defineProperty(exports, name, {
        enumerable: true,
        get: () => (name in own ? own[name] : cucumber()[name]),
      });
    }
    return exports;
  };
  standIn.exports = required.esModule
    ? Object.defineProperty(exportsOf(required.names), "__esModule", {
        value: true,
      })
    : exportsOf(required.names);
  require.cache[file] = standIn;
  return {
    exports: exportsOf(imported),
    restore: () => {
      loading = false;
      if (cucumbers) {
        require.cache[file] = cucumbers;
      } else {
        Reflect.deleteProperty(require.cache, file);
      }
    },
  };
};

/** Loads the support code (`importSupport`) with the replacement; after it, the replacement refuses definitions. */
export const loadWithReplacement = async (
  importSupport: () => Promise<void>,
) => {
  const own = {
    // A dynamic import: a static `import * as` makes the build give the recorders' module (which the
    // page loads too) a namespace helper importing `node:module`, a warning in a page's build.
    ...(await import("../cucumber/recorders.ts")),
    world,
    context,
    World,
    DataTable,
    wrapPromiseWithTimeout,
    Status: TestStepResultStatus,
    version: inject("vitestCucumber").version,
    HookTarget,
  };
  const found = cucumberExports();
  const replacement = found
    ? lazyReplacement(own, found)
    : await loadedReplacement(own);
  vi.doMock("@cucumber/cucumber", () => replacement.exports);
  try {
    await importSupport();
  } finally {
    vi.doUnmock("@cucumber/cucumber");
    replacement.restore();
  }
};
