// The steps that run Vitest in a scenario's project: once (in a kept Vitest if it can, see
// `../support/kept.ts`), in watch mode (see `../support/watch.ts`), and the changes that rerun it.
import { Given, When } from "@cucumber/cucumber";
import { rm, writeFile } from "node:fs/promises";
import type { CliOptions } from "vitest/node";
import { writeConfig } from "../support/config.ts";
import { closeKept } from "../support/kept.ts";
import { listVitest } from "../support/listVitest.ts";
import { openVitest } from "../support/openVitest.ts";
import {
  CONFIG,
  defaultConfig,
  writeDefaultConfig,
} from "../support/project.ts";
import { runVitest } from "../support/runVitest.ts";
import { watchVitest } from "../support/watch.ts";
import type { E2EWorld } from "../support/world.ts";

const toFilters = (args: string) => args.split(/\s+/).filter(Boolean);
const toOptions = (json: string) => JSON.parse(json) as CliOptions;

// Each run step, as is or in a mode (the default config, see `writeDefaultConfig`), with Vitest's
// file filters or command line options. One function per step: cucumber checks their arity.
for (const [step, start] of [
  ["I run vitest", runVitest],
  ["I start vitest in watch mode", watchVitest],
] as const) {
  /** Starts Vitest in the mode's default config, if the step names a mode. */
  const startIn = async (
    world: E2EWorld,
    mode: string | undefined,
    options: { filters?: string[]; options?: CliOptions } = {},
  ) => {
    if (mode) {
      await writeDefaultConfig.call(world, mode);
    }
    return start.call(world, options);
  };
  When(step, (world: E2EWorld) => {
    return startIn(world, undefined);
  });
  When(`${step} with {string}`, (world: E2EWorld, filters: string) => {
    return startIn(world, undefined, { filters: toFilters(filters) });
  });
  When(`${step} with options:`, (world: E2EWorld, json: string) => {
    return startIn(world, undefined, { options: toOptions(json) });
  });
  When(`${step} in {word} mode`, (world: E2EWorld, mode: string) => {
    return startIn(world, mode);
  });
  When(
    `${step} in {word} mode with {string}`,
    (world: E2EWorld, mode: string, filters: string) => {
      return startIn(world, mode, { filters: toFilters(filters) });
    },
  );
  When(
    `${step} in {word} mode with options:`,
    (world: E2EWorld, mode: string, json: string) => {
      return startIn(world, mode, { options: toOptions(json) });
    },
  );
  When(
    `${step} in {word} mode with {string} and options:`,
    (world: E2EWorld, mode: string, filters: string, json: string) => {
      return startIn(world, mode, {
        filters: toFilters(filters),
        options: toOptions(json),
      });
    },
  );
}

// `vitest list` in the mode's default config (see `../support/listVitest.ts`): as its command line
// runs it by default (Vitest's static collection: the files parsed, not run), or as `vitest list
// --staticParse=false` (the files imported, their tests collected, none run).
for (const [step, staticParse] of [
  ["I list its tests", true],
  ["I collect its tests", false],
] as const) {
  When(`${step} in {word} mode`, async (world: E2EWorld, mode: string) => {
    await writeDefaultConfig.call(world, mode);
    await listVitest.call(world, { staticParse });
  });
  When(
    `${step} in {word} mode with {string}`,
    async (world: E2EWorld, mode: string, filters: string) => {
      await writeDefaultConfig.call(world, mode);
      await listVitest.call(world, {
        filters: toFilters(filters),
        staticParse,
      });
    },
  );
  When(
    `${step} in {word} mode with options:`,
    async (world: E2EWorld, mode: string, json: string) => {
      await writeDefaultConfig.call(world, mode);
      await listVitest.call(world, { options: toOptions(json), staticParse });
    },
  );
  When(
    `${step} in {word} mode with {string} and options:`,
    async (world: E2EWorld, mode: string, filters: string, json: string) => {
      await writeDefaultConfig.call(world, mode);
      await listVitest.call(world, {
        filters: toFilters(filters),
        options: toOptions(json),
        staticParse,
      });
    },
  );
}

// The scenario's own config, in a fresh Vitest (not a kept one): e.g. a run that fails as Vitest
// starts (the plugin refusing its options), which Vitest reports as its command line does.
// This worker's kept Vitests (`../support/kept.ts`: up to one per mode, their pages in the shared
// Chromium, ~1–1.5 GB) closed before a scenario's heaviest part: a run in another browser
// (Firefox, WebKit: their own), a Storybook build or dev server. Put where the file needs them least
// (its last scenarios): a later default run starts its mode's again (~0.4–1.4 s).
Given("the worker's kept Vitests are closed", async () => {
  await closeKept();
});

When("I run vitest in a fresh Vitest", (world: E2EWorld) => {
  return runVitest.call(world, { fresh: true });
});

// Never in a kept Vitest: in one, Vitest's browser pool can leave its own rejection of a file whose
// page reloads unhandled (Vitest's bug, see `notes/issues.md` 3a; until Vitest fixes it).
When(
  "I run vitest in a fresh Vitest in {word} mode",
  async (world: E2EWorld, mode: string) => {
    await writeDefaultConfig.call(world, mode);
    return runVitest.call(world, { fresh: true });
  },
);

// Vitest open without a watcher (see `../support/openVitest.ts`): its tests run, a file changed
// with no one told, its tests run again.
When(
  "I open vitest without a watcher in {word} mode",
  async (world: E2EWorld, mode: string) => {
    await writeDefaultConfig.call(world, mode);
    await openVitest.call(world);
  },
);

/** The scenario's Vitest open without a watcher. */
const open = (world: E2EWorld) => {
  if (!world.open) {
    throw new Error(
      "Vitest isn't open: add a `When I open vitest without a watcher in <mode> mode` step",
    );
  }
  return world.open;
};

When("I run its tests", (world: E2EWorld) => {
  return open(world).run();
});

for (const step of [
  "the file {string} is changed, unseen, to:",
  "the file {string} is added, unseen, with:",
]) {
  When(step, async (world: E2EWorld, name: string, content: string) => {
    open(world);
    await writeFile(world.file(name), content);
  });
}

/** The scenario's Vitest in watch mode (see `../support/watch.ts`). */
const watching = (world: E2EWorld) => {
  if (!world.watching) {
    throw new Error(
      "Vitest isn't watching: add a `When I start vitest in watch mode` step",
    );
  }
  return world.watching;
};

/** Makes a change to the watched project, and waits for the run it starts. */
const rerunAfter = (world: E2EWorld, change: () => Promise<void>) =>
  watching(world).rerunAfter(change);

for (const step of [
  "I change the file {string} to:",
  "I add the file {string} with:",
]) {
  When(step, (world: E2EWorld, name: string, content: string) => {
    return rerunAfter(world, () => writeFile(world.file(name), content));
  });
}

// Its run runs while the next change is made (see `rerunAfter`).
When(
  "I start changing the file {string} to:",
  (world: E2EWorld, name: string, content: string) => {
    return watching(world).startRun(() => writeFile(world.file(name), content));
  },
);

// The default config written again with other options for the plugin, while Vitest watches: its
// config file changed, Vitest restarts (everything closed, its config resolved again, every file
// run). Node and browser mode: a Storybook project's options are its addon entry's, not its
// Vitest config's.
let configChanges = 0;
When("I change the plugin options to:", (world: E2EWorld, options: string) => {
  if (world.ownConfig || world.mode === "storybook") {
    throw new Error(
      "The plugin's options are changed in the default config, in node or browser mode",
    );
  }
  return rerunAfter(world, async () => {
    world.pluginOptions = JSON.parse(options);
    await writeConfig(
      world,
      CONFIG,
      defaultConfig(world.pluginOptions, world.mode),
      `vitest.scenario.${String(++configChanges)}.ts`,
    );
  });
});

When("I remove the file {string}", (world: E2EWorld, name: string) => {
  return rerunAfter(world, () => rm(world.file(name)));
});

When(
  "I change Vitest's filename filter to {string}",
  (world: E2EWorld, pattern: string) => {
    return watching(world).changeFilter(pattern);
  },
);
