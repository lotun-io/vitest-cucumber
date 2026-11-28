// Cucumber's version, as installed: what a page's stand-in reports (`../../types/providedContext.ts`,
// Storybook's preview's support module).
import { createRequire } from "node:module";

/** Cucumber's version, as installed (its `package.json`: lighter than loading cucumber). */
export const cucumberVersion = (
  createRequire(import.meta.url)("@cucumber/cucumber/package.json") as {
    version: string;
  }
).version;
