import type { CucumberOptions } from "@lotun/vitest-cucumber";

// The root features' support code, as the root's `node` and `browser` projects load it.
const options: CucumberOptions = {
  import: ["../features/support/**/*.ts", "../features/steps/**/*.ts"],
};

export default options;
