import { defineConfig } from "tsdown";

export default defineConfig([
  {
    platform: "node",
    // Every module: pages and workers load the plugin's own by path (`ownModule`), not by its exports.
    entry: ["src/**/*.ts", "!**/__*__/**"],
    format: "esm",
    outDir: "dist",
    // Declarations for what users can import only: `publishConfig.exports` in `package.json`.
    dts: {
      entry: [
        "src/index.ts",
        "src/worker/storybook/index.ts",
        "src/core/storybook/node.ts",
        "src/core/storybook/preset.ts",
      ],
    },
    sourcemap: true,
    unbundle: true,
    // No constant inlined across modules: the preview's support module (a placeholder whose code the
    // preset serves, `worker/storybook/preview/support.ts`) must stay a real import, its values read
    // where they're used (inlined, the page never sees the served code).
    inputOptions: { optimization: { inlineConst: false } },
  },
]);
