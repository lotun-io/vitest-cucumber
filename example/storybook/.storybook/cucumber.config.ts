import type { CucumberOptions } from "@lotun/vitest-cucumber";

const options: CucumberOptions = {
  import: ["features/**/*.ts"],
};

export default options;
