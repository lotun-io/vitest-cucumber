import { defineConfig } from "vitest/config";
import { cucumber } from "@lotun/vitest-cucumber";

export default defineConfig({
  plugins: [
    cucumber({
      import: ["features/support/**/*.ts", "features/step_definitions/**/*.ts"],
    }),
  ],
  test: {
    environment: "node",
    include: ["features/**/*.feature"],
  },
});
