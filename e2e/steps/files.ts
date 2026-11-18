import { Given } from "@cucumber/cucumber";
import path from "node:path";
import { writeConfig } from "../support/config.ts";
import { writeDefaultConfig } from "../support/project.ts";
import type { E2EWorld } from "../support/world.ts";

Given(
  "a file named {string} with:",
  async function (this: E2EWorld, name: string, content: string) {
    if (path.basename(name) === "vitest.config.ts") {
      throw new Error(
        `Write ${name} with "the Vitest config:" (or "the Vitest config {string}:")`,
      );
    }
    await this.write(name, content);
  },
);

/** Replaces the default config (see `./vitest.ts`) with the scenario's own. */
Given("the Vitest config:", async function (this: E2EWorld, content: string) {
  this.ownConfig = true;
  await writeConfig(this, "vitest.config.ts", content);
});

/** A config of the scenario's own at `name`: e.g. a project's, in a monorepo. */
Given(
  "the Vitest config {string}:",
  async function (this: E2EWorld, name: string, content: string) {
    if (path.basename(name) !== "vitest.config.ts") {
      throw new Error(`A Vitest config is named vitest.config.ts, not ${name}`);
    }
    if (path.normalize(name) === "vitest.config.ts") {
      this.ownConfig = true;
    }
    await writeConfig(this, name, content);
  },
);

/** The plugin's options, in the default config. */
Given("the plugin options:", async function (this: E2EWorld, options: string) {
  this.pluginOptions = JSON.parse(options);
  await writeDefaultConfig.call(this, "node");
});
