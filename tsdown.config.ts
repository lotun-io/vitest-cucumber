import { defineConfig } from "tsdown";

export default defineConfig([
  {
    platform: "node",
    entry: ["src/**/*.ts", "!**/__*__/**"],
    format: "esm",
    outDir: "dist",
    dts: true,
    sourcemap: true,
    unbundle: true,
  },
]);
