// Every scenario is a Vitest project of its own, in `tmp/e2e/<feature>_<line>`: its steps write its
// files and options, and run Vitest on it in this process, with the plugin from `src`, so its
// coverage counts (see `./run.ts`): a run of the default config without filters or options in a
// Vitest the worker keeps for its feature file (`tmp/e2e/kept/`), any other in a new Vitest in a
// copy of the project (`tmp/e2e/run/`; see `./runVitest.ts`). Each scenario's project is removed
// after it, unless `E2E_KEEP` is set (e.g. `E2E_KEEP=1`, to look at a failing one's files).
import {
  After,
  AfterAll,
  Before,
  setWorldConstructor,
  World,
} from "@cucumber/cucumber";
import type { Envelope } from "@cucumber/messages";
import { mkdir, rm, symlink, writeFile } from "node:fs/promises";
import path from "node:path";
import type { Page } from "playwright";
import type { ParsedStack } from "vitest";
import type { CucumberOptions } from "../../src/types/feature.ts";
import { closeKept } from "./kept.ts";
import { normalize } from "./paths.ts";
import { type Mode, writeDefaultConfig } from "./project.ts";
import { closeStaticBrowser } from "./storybookStatic.ts";

export interface RunResult {
  /**
   * The project's directory Vitest ran in: the scenario's (watch mode), a kept Vitest's or a run
   * folder (`./kept.ts`).
   */
  dir: string;
  /** Vitest's exit code. */
  exitCode: number;
  /** Vitest's output. */
  output: string;
  /** Each test module (feature file), relative to the project, and its state. */
  modules: Map<string, string>;
  /**
   * Every Vitest test (scenario), in order: its full name, its own (the scenario's or example's),
   * its state, its errors' messages and their frames (as Vitest parsed and mapped them, the ones it
   * prints), how many times Vitest retried it, whether it ran, its annotations (type, message, an
   * attachment's content type), and a skipped one's note.
   */
  tests: {
    /** Its test module (feature file), relative to the project. */
    module: string;
    name: string;
    ownName: string;
    state: string;
    errors: string[];
    stacks: ParsedStack[][];
    retryCount: number;
    /** Vitest ran it: no filter (line, tag, name) left it out. */
    ran: boolean;
    annotations: { type: string; message: string; contentType?: string }[];
    /** Its annotations' attachments' content, as base64, in order (none for one without). */
    contents: (string | undefined)[];
    note?: string;
  }[];
}

/**
 * A scenario's folder removed, retried a while: on Windows a folder a process still has files open
 * in (a `storybook dev` just stopped, its handles let go a moment later) can't be removed yet
 * (`EBUSY`, `EPERM`), which Node's `rm` retries.
 */
const removeOptions = {
  recursive: true,
  force: true,
  maxRetries: 10,
  retryDelay: 200,
};

export class E2EWorld extends World {
  /** The scenario's project. */
  dir = "";
  /**
   * The scenario's plugin options (`cucumber(options)`), in the default config over its `import`
   * (every support file of `features/`: see `./project.ts`).
   */
  pluginOptions: Partial<CucumberOptions> = {};
  /**
   * The runs' Cucumber Messages, once the scenario collects them: every run's stream, in order (the
   * harness subscribes to each Vitest it runs: `./messages.ts`).
   */
  messages?: Envelope[];
  /** The scenario replaced the default config with its own (see `../steps/files.ts`). */
  ownConfig = false;
  /** The default config's mode (see `./project.ts`). */
  mode: Mode = "node";
  result?: RunResult;
  /** Vitest in watch mode, if the scenario started it (see `./watch.ts`). */
  watching?: {
    /** Makes a change, and waits for the run it starts: the scenario's last run from then on. */
    rerunAfter(change: () => Promise<void>): Promise<void>;
    /** Makes a change, and waits for the run it starts to run a test: the next change's during it. */
    startRun(change: () => Promise<void>): Promise<void>;
    /** Vitest's filename filter changed, as its `p` key does (its run waited for: `rerunAfter`). */
    changeFilter(pattern: string): Promise<void>;
    close(): Promise<void>;
  };

  /** Vitest open without a watcher, if the scenario opened it (see `./openVitest.ts`). */
  open?: { run(): Promise<void>; close(): Promise<void> };

  /** The Storybook project's dev server, if the scenario started it (see `../steps/storybook.ts`). */
  storybookDev?: { url: string; close: () => Promise<void> };

  /**
   * A page of the dev server's preview the scenario keeps open, and its reloads since it was opened
   * (see `../steps/storybookDev.ts`).
   */
  storybookPage?: { page: Page; loads: { count: number } };

  /** The project's files' times as the scenario's page was opened (`../steps/storybookDev.ts`). */
  fileTimes?: Map<string, number>;

  /** The tests the scenario's last `vitest list` found, each with its location (`../support/listVitest.ts`). */
  listed?: {
    tests: { name: string; location: string }[];
    errors: string[];
    output: string;
  };

  /** The files the steps wrote before the run, by name (relative to `dir`): their content. */
  files = new Map<string, string>();

  /** The scenario's runs start with no dependency cache, as a first run does (`../steps/files.ts`). */
  coldCaches = false;

  file(name: string): string {
    return path.join(this.dir, name);
  }

  /**
   * Writes the file `name` of the scenario's project. One in `node_modules` (a package of the
   * scenario's own, e.g. steps its support code imports) is only kept: the folder its run's
   * Vitest starts in gets it (`runDirFor`, `./kept.ts`: a run's alone, `When I run vitest`), never
   * the scenario's `node_modules`, which in a Storybook project is a link to `storybook/`'s.
   */
  async write(name: string, content: string) {
    this.files.set(normalize(name), content);
    if (normalize(name).split("/")[0] === "node_modules") {
      return;
    }
    const file = this.file(name);
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, content);
  }

  get lastRun(): RunResult {
    if (!this.result) {
      throw new Error("Vitest hasn't run yet: add a `When I run vitest` step");
    }
    return this.result;
  }
}

setWorldConstructor(E2EWorld);

Before(async (world: E2EWorld, { pickle }) => {
  const feature = path.basename(pickle.uri, ".feature");
  const line = pickle.location?.line ?? 0;
  world.dir = path.resolve("tmp", "e2e", `${feature}_${line}`);
  await rm(world.dir, removeOptions);
  // The plugin, as if installed: a scenario's own package.json would hide this package from it.
  const plugin = path.join(world.dir, "node_modules/@lotun/vitest-cucumber");
  await mkdir(path.dirname(plugin), { recursive: true });
  await symlink(path.resolve(), plugin, "dir");
  // Every scenario has a config: the default one, unless it replaces it (see `../steps/files.ts`).
  await writeDefaultConfig.call(world, "node");
});

// Every resource the scenario opened is closed, whatever one of them throws (a `storybook dev` left
// running would outlive the whole run: it has a session of its own); then the first error, if any.
After(async (world: E2EWorld) => {
  const closes = [
    () => world.watching?.close(),
    () => world.open?.close(),
    () => world.storybookPage?.page.close(),
    () => world.storybookDev?.close(),
  ];
  const errors: unknown[] = [];
  for (const close of closes) {
    try {
      await close();
    } catch (error) {
      errors.push(error);
    }
  }
  if (!process.env.E2E_KEEP) {
    await rm(world.dir, removeOptions);
  }
  if (errors.length > 0) {
    throw errors[0];
  }
});

// The worker's end: the Vitests it kept (the e2e project's: one feature file's, `isolate: true`; the
// compatibility kit's: many samples', `isolate: false`).
AfterAll(closeKept);
AfterAll(closeStaticBrowser);
