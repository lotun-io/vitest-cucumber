import { cucumber } from "@lotun/vitest-cucumber";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [cucumber({ import: ["features/**/*.ts"] })],
  test: {
    include: ["features/**/*.feature"],
    environment: "node",
    isolate: false,
  },
});
