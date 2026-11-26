import { Given } from "@cucumber/cucumber";
import path from "node:path";
import { writeConfig } from "../support/config.ts";
import { writeDefaultConfig } from "../support/project.ts";
import type { E2EWorld } from "../support/world.ts";

Given(
  "a file named {string} with:",
  async (world: E2EWorld, name: string, content: string) => {
    if (path.basename(name) === "vitest.config.ts") {
      throw new Error(
        `Write ${name} with "the Vitest config:" (or "the Vitest config {string}:")`,
      );
    }
    await world.write(name, content);
  },
);

/**
 * The scenario's runs start as a first run does, with no dependency cache (the run folders keep
 * theirs warm between runs: `../support/kept.ts`): what Vite pre-bundles, it works out again.
 */
Given("no dependency cache", (world: E2EWorld) => {
  world.coldCaches = true;
});

/** Replaces the default config (see `./vitest.ts`) with the scenario's own. */
Given("the Vitest config:", async (world: E2EWorld, content: string) => {
  world.ownConfig = true;
  await writeConfig(world, "vitest.config.ts", content);
});

/** A config of the scenario's own at `name`: e.g. a project's, in a monorepo. */
Given(
  "the Vitest config {string}:",
  async (world: E2EWorld, name: string, content: string) => {
    if (path.basename(name) !== "vitest.config.ts") {
      throw new Error(`A Vitest config is named vitest.config.ts, not ${name}`);
    }
    if (path.normalize(name) === "vitest.config.ts") {
      world.ownConfig = true;
    }
    await writeConfig(world, name, content);
  },
);

/** The plugin's options, in the default config of the scenario's mode (a Storybook project stays one). */
Given("the plugin options:", async (world: E2EWorld, options: string) => {
  world.pluginOptions = JSON.parse(options);
  await writeDefaultConfig.call(world, world.mode);
});
