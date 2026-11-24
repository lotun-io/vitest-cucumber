import { readFileSync } from "node:fs";
import { defineConfig } from "tsdown";

/** The published package's exports (`package.json`'s `publishConfig.exports`): each subpath's conditions. */
const {
  publishConfig,
}: {
  publishConfig: { exports: Record<string, Record<string, string>> };
} = JSON.parse(readFileSync("package.json", "utf8"));

/**
 * The source of each export's declarations: the exports with a `types` condition
 * (`./dist/<path>.d.mts`, made from `src/<path>.ts`). An export without one gets none: Storybook's
 * preset, which only Storybook loads, as JavaScript (as Storybook's addon template exports its own).
 */
const typedEntries = Object.entries(publishConfig.exports).flatMap(
  ([subpath, { types }]) => {
    if (types === undefined) {
      return [];
    }
    const source = /^\.\/dist\/(.+)\.d\.mts$/.exec(types)?.[1];
    if (source === undefined) {
      throw new Error(
        `package.json: the "${subpath}" export's types (${types}) aren't a ./dist/<path>.d.mts`,
      );
    }
    return [`src/${source}.ts`];
  },
);

export default defineConfig([
  {
    platform: "node",
    // Every module: pages and workers load the plugin's own by path (`ownModule`), not by its exports.
    entry: ["src/**/*.ts", "!**/__*__/**"],
    format: "esm",
    outDir: "dist",
    // Declarations for what users can import only: the exports `package.json` types.
    dts: { entry: typedEntries },
    sourcemap: true,
    unbundle: true,
    // No constant inlined across modules: the preview's support module (a placeholder whose code the
    // preset serves, `worker/storybook/preview/support.ts`) must stay a real import, its values read
    // where they're used (inlined, the page never sees the served code).
    inputOptions: { optimization: { inlineConst: false } },
  },
]);
