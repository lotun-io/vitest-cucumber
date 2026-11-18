// The steps that run Vitest in a scenario's project: once (in a kept Vitest if it can, see
// `../support/kept.ts`), in watch mode (see `../support/watch.ts`), and the changes that rerun it.
import { When } from "@cucumber/cucumber";
import { rm, writeFile } from "node:fs/promises";
import type { CliOptions } from "vitest/node";
import { openVitest } from "../support/openVitest.ts";
import { writeDefaultConfig } from "../support/project.ts";
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
  When(step, function (this: E2EWorld) {
    return startIn(this, undefined);
  });
  When(`${step} with {string}`, function (this: E2EWorld, filters: string) {
    return startIn(this, undefined, { filters: toFilters(filters) });
  });
  When(`${step} with options:`, function (this: E2EWorld, json: string) {
    return startIn(this, undefined, { options: toOptions(json) });
  });
  When(`${step} in {word} mode`, function (this: E2EWorld, mode: string) {
    return startIn(this, mode);
  });
  When(
    `${step} in {word} mode with {string}`,
    function (this: E2EWorld, mode: string, filters: string) {
      return startIn(this, mode, { filters: toFilters(filters) });
    },
  );
  When(
    `${step} in {word} mode with options:`,
    function (this: E2EWorld, mode: string, json: string) {
      return startIn(this, mode, { options: toOptions(json) });
    },
  );
  When(
    `${step} in {word} mode with {string} and options:`,
    function (this: E2EWorld, mode: string, filters: string, json: string) {
      return startIn(this, mode, {
        filters: toFilters(filters),
        options: toOptions(json),
      });
    },
  );
}

// The scenario's own config, in a fresh Vitest (not a kept one): e.g. a run that fails as Vitest
// starts (the plugin refusing its options), which Vitest reports as its command line does.
When("I run vitest in a fresh Vitest", function (this: E2EWorld) {
  return runVitest.call(this, { fresh: true });
});

// Never in a kept Vitest: in one, Vitest's browser pool can leave its own rejection of a file whose
// page reloads unhandled (Vitest's bug, see `notes/issues.md` 3a; until Vitest fixes it).
When(
  "I run vitest in a fresh Vitest in {word} mode",
  async function (this: E2EWorld, mode: string) {
    await writeDefaultConfig.call(this, mode);
    return runVitest.call(this, { fresh: true });
  },
);

// Vitest open without a watcher (see `../support/openVitest.ts`): its tests run, a file changed
// with no one told, its tests run again.
When(
  "I open vitest without a watcher in {word} mode",
  async function (this: E2EWorld, mode: string) {
    await writeDefaultConfig.call(this, mode);
    await openVitest.call(this);
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

When("I run its tests", function (this: E2EWorld) {
  return open(this).run();
});

for (const step of [
  "the file {string} is changed, unseen, to:",
  "the file {string} is added, unseen, with:",
]) {
  When(step, async function (this: E2EWorld, name: string, content: string) {
    open(this);
    await writeFile(this.file(name), content);
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
  When(step, function (this: E2EWorld, name: string, content: string) {
    return rerunAfter(this, () => writeFile(this.file(name), content));
  });
}

// Its run runs while the next change is made (see `rerunAfter`).
When(
  "I start changing the file {string} to:",
  function (this: E2EWorld, name: string, content: string) {
    return watching(this).startRun(() => writeFile(this.file(name), content));
  },
);

When("I remove the file {string}", function (this: E2EWorld, name: string) {
  return rerunAfter(this, () => rm(this.file(name)));
});

When(
  "I change Vitest's filename filter to {string}",
  function (this: E2EWorld, pattern: string) {
    return watching(this).changeFilter(pattern);
  },
);
