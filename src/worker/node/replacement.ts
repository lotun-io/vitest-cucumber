// Node mode's support code loading, with the plugin's replacement of `@cucumber/cucumber` while it
// loads and cucumber itself after. The replacement is one object, cucumber's exports with the plugin's own
// where the runtime has its own (the support code's methods recording; `world`, `context`, `World`,
// `DataTable` and `wrapPromiseWithTimeout` the runtime's copies, so no cucumber code runs in the
// worker), which the support code gets both ways: an import through Vitest's mock (`vi.doMock`), a
// `require` from Node's module cache (`require.cache`, cucumber's entry's `exports` swapped for it).
// Then `vi.doUnmock` and cucumber's own exports back, so a later import or `require` is cucumber's own; the
// support modules keep what they got: a definition they make later fails (`../cucumber/registry.ts`).
import { createRequire } from "node:module";
import { vi } from "vitest";
import { DataTable } from "../cucumber/dataTable.ts";
import { context, world } from "../cucumber/scope.ts";
import { World } from "../cucumber/world.ts";
import { wrapPromiseWithTimeout } from "../runner/timeout.ts";

const require = createRequire(import.meta.url);

/**
 * Cucumber's entry in Node's module cache (loaded first, if it wasn't): `replace` swaps its
 * `exports` for the given ones (what a `require` of it returns), and `restore` puts cucumber's own
 * back (cucumber's code keeps its own object either way). None if cucumber's package can't be
 * required (its `exports` has no `require`).
 */
const requireCucumberModule = () => {
  let file: string;
  try {
    file = require.resolve("@cucumber/cucumber");
  } catch {
    return undefined;
  }
  require(file);
  const entry = require.cache[file];
  if (!entry) {
    return undefined;
  }
  const own: unknown = entry.exports;
  return {
    replace: (replacement: unknown) => {
      entry.exports = replacement;
    },
    restore: () => {
      entry.exports = own;
    },
  };
};

/** Loads the support code (`importSupport`) with the replacement; after it, the replacement refuses definitions. */
export const loadWithReplacement = async (
  importSupport: () => Promise<void>,
) => {
  const replacement = {
    ...(await import("@cucumber/cucumber")),
    // A dynamic import: a static `import * as` makes the build give the recorders' module (which the
    // page loads too) a namespace helper importing `node:module`, a warning in a page's build.
    ...(await import("../cucumber/recorders.ts")),
    world,
    context,
    World,
    DataTable,
    wrapPromiseWithTimeout,
  };
  // A `require` of cucumber's file gets the replacement from Node's module cache (cucumber's entry,
  // loaded first: its own exports put back after).
  const cucumberModule = requireCucumberModule();
  cucumberModule?.replace(replacement);
  vi.doMock("@cucumber/cucumber", () => replacement);
  try {
    await importSupport();
  } finally {
    vi.doUnmock("@cucumber/cucumber");
    cucumberModule?.restore();
  }
};
