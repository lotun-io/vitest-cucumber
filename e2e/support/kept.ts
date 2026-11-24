// The Vitest instances an e2e worker keeps open between a feature file's scenarios (the e2e project
// runs with `isolate: true`: a worker process per feature file, its native memory given back as the
// file ends): a scenario's run without filters or options reuses its slot's Vitest when it has the
// scenario's files outside `features/`, rather than starting Vitest again (a run of a browser or
// Storybook scenario: ~0.4 s and ~1.4 s saved). A slot per mode (node, browser, Storybook) for the
// default config, made as the file first needs it (a kept Vitest doesn't grow between scenarios);
// any other config (its own, the plugin's options, other files) runs in a new Vitest, closed after
// it, in the mode's run folder (`runDirFor`, `./runVitest.ts`). Each slot has its folder, its
// `node_modules` kept, so the dependency caches stay warm (browser mode's in `node_modules/.vite`,
// Storybook's found by the config folder's path): a Vitest pre-bundling again leaves ~140 MB of
// native memory behind. The folders are named
// after the worker's `VITEST_POOL_ID` (its slot, 1 to the run's `maxWorkers`, shared by all
// projects: no two workers running at once have the same) and kept after the run: the next worker
// in that slot, the next file's or the next run's, finds them warm (only the first warms them).
import type { Envelope } from "@cucumber/messages";
import {
  copyFile,
  cp,
  lstat,
  mkdir,
  readdir,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import type { Vitest } from "vitest/node";
import { createVitest } from "vitest/node";
import { checkPluginModules, writeConfig } from "./config.ts";
import { collectMessages } from "./messages.ts";
import { normalize, relative, slash } from "./paths.ts";
import { CONFIG, defaultConfig, defaultStorybookConfig } from "./project.ts";
import {
  capture,
  collectGarbage,
  runResult,
  showExit,
  viteLogger,
} from "./run.ts";
import { storybookPackage } from "./storybookProject.ts";
import type { E2EWorld, RunResult } from "./world.ts";

/**
 * This worker's name for its folders: its `VITEST_POOL_ID` (the same for the worker's whole life,
 * and in every run); the process's id outside Vitest.
 */
const workerName = process.env.VITEST_POOL_ID ?? `pid${process.pid}`;

/**
 * A Vitest this worker keeps (for its feature file's scenarios), for the scenarios whose files
 * outside `features/` are its `files` (`key`: them, as text): in a directory of its own, the
 * scenarios take turns. Only `features/` changes between them, which the plugin and Vitest load again
 * each run (`invalidateFile`); the rest, Node keeps as it loaded it (e.g. a `cucumber.mjs`, imported
 * once).
 */
interface Kept {
  key: string;
  dir: string;
  /** Its files outside `features/`, by name: its key's. */
  files: Map<string, string>;
  vitest: Vitest;
  output: ReturnType<typeof capture>;
}

/**
 * The Vitest this worker keeps, by slot: `node`, `browser`, `storybook` (see `slotOf`).
 */
const kept = new Map<string, Kept>();
/** The slots: node, browser, storybook. */
const SLOTS = 3;
// Each Vitest open listens to the process' signals (its logger's, its browser's) until it closes:
// the kept ones', and a scenario's own run.
process.setMaxListeners(
  Math.max(process.getMaxListeners(), 10 + 3 * (SLOTS + 1)),
);

/** Whether `name` (relative to the project) is in `features/`: what a kept Vitest's runs change. */
const inFeatures = (name: string) => name.split("/")[0] === "features";

/** The key of a kept Vitest's files outside `features/` (see `Kept`): them, in name order. */
const keyOf = (files: Map<string, string>) =>
  JSON.stringify([...files].sort(([a], [b]) => a.localeCompare(b)));

/**
 * The files outside `features/` of the kept Vitest for the scenario: its own, with the default
 * config its mode's (see `defaultConfig`); a Storybook project's, its default config and
 * Storybook's (`.storybook/`, the same for every scenario: see `storybookFiles`).
 */
async function keptFiles(this: E2EWorld) {
  const files = new Map([...this.files].filter(([name]) => !inFeatures(name)));
  if (!this.ownConfig) {
    await writeConfig(
      {
        write: async (name, content) => {
          files.set(normalize(name), content);
        },
      },
      CONFIG,
      this.mode === "storybook"
        ? defaultStorybookConfig()
        : defaultConfig(this.pluginOptions, this.mode),
    );
  }
  return files;
}

/**
 * Makes `dir` a slot's folder for a new Vitest in `mode`: everything removed but its `node_modules`
 * (its dependency caches) when that is the mode's kind (Storybook's: a link to `storybook/`'s; any
 * other's: a folder with the plugin linked in it).
 */
const prepareDir = async (dir: string, mode: string) => {
  await mkdir(dir, { recursive: true });
  const modules = path.join(dir, "node_modules");
  const storybook = mode === "storybook";
  const linked = await lstat(modules).then(
    (stats) => stats.isSymbolicLink(),
    () => undefined,
  );
  for (const entry of await readdir(dir)) {
    if (entry !== "node_modules" || linked !== storybook) {
      await rm(path.join(dir, entry), { recursive: true, force: true });
    }
  }
  if (linked === storybook) {
    return;
  }
  if (storybook) {
    // A Storybook project's `node_modules`: `storybook/`'s (Storybook, React, the plugin).
    await symlink(path.join(storybookPackage, "node_modules"), modules, "dir");
  } else {
    const plugin = path.join(modules, "@lotun/vitest-cucumber");
    await mkdir(path.dirname(plugin), { recursive: true });
    await symlink(path.resolve(), plugin, "dir");
  }
};

/**
 * A run folder of this worker for a one-off run in `mode` (a new Vitest's: `./runVitest.ts`),
 * with the scenario's project `scenarioDir` copied in (all but its `node_modules`). One per mode,
 * reused, its `node_modules` kept: the dependency caches stay warm, as a kept slot's (`prepareDir`).
 */
export const runDirFor = async (scenarioDir: string, mode: string) => {
  const dir = path.resolve("tmp", "e2e", "run", `${workerName}-${mode}`);
  await prepareDir(dir, mode);
  const modules = path.join(scenarioDir, "node_modules");
  await cp(scenarioDir, dir, {
    recursive: true,
    filter: (source) => source !== modules,
  });
  return dir;
};

/** Closes the Vitest this worker keeps (their folders stay, warm for the slot's next worker). */
export const closeKept = async () => {
  const entries = [...kept.values()];
  kept.clear();
  for (const { vitest } of entries) {
    await vitest.close();
  }
  collectGarbage();
};

/** Whether `name` (outside `features/`) is the default config's: its config files, Storybook's. */
const isDefaultFile = (name: string) =>
  ["vitest.config.ts", "vitest.scenario.ts"].includes(name) ||
  name.startsWith(".storybook/");

/**
 * The scenario's slot: its mode's (node, browser, storybook) with the default config (no plugin
 * options, no other file outside `features/`); none with any other config, or in Firefox or WebKit
 * (a few scenarios only): a new Vitest runs it (`./runVitest.ts`).
 */
const slotOf = (world: E2EWorld, files: Map<string, string>) =>
  ["node", "browser", "storybook"].includes(world.mode) &&
  !world.ownConfig &&
  Object.keys(world.pluginOptions).length === 0 &&
  [...files.keys()].every(isDefaultFile)
    ? world.mode
    : undefined;

/**
 * The kept Vitest for the scenario's files (see `Kept`): its slot's (`slotOf`) if it has their key,
 * else a new one in its place (the slot's former one closed). Undefined if it can't start: the
 * scenario's run shows why (see `runVitest`).
 */
export async function keptFor(this: E2EWorld): Promise<Kept | undefined> {
  const files = await keptFiles.call(this);
  const slot = slotOf(this, files);
  if (!slot) {
    return undefined;
  }
  const key = keyOf(files);
  const current = kept.get(slot);
  if (current?.key === key) {
    return current;
  }
  if (current) {
    kept.delete(slot);
    // Its folder stays (the next one's: `prepareDir`).
    await current.vitest.close();
    collectGarbage();
  }
  const dir = path.resolve("tmp", "e2e", "kept", `${workerName}-${slot}`);
  await prepareDir(dir, this.mode);
  // Its key's files, and the scenario's `features/` too: a Storybook project's addon indexes its
  // stories files as Vitest starts (with none yet, Storybook warns: "No story files found"). The
  // runs write each scenario's again (`runKept`).
  for (const [name, content] of [
    ...files,
    ...[...this.files].filter(([name]) => inFeatures(name)),
  ]) {
    await mkdir(path.dirname(path.join(dir, name)), { recursive: true });
    await writeFile(path.join(dir, name), content);
  }
  const output = capture();
  const { exitCode } = process;
  let vitest: Vitest;
  try {
    vitest = await createVitest(
      // As `startSession`'s; not watching: its runs are the scenarios'.
      { root: dir, watch: false, silent: false, cache: false },
      { customLogger: viteLogger(output) },
      { stdout: output.stream, stderr: output.stream },
    );
    await vitest.standalone();
  } catch {
    return undefined;
  } finally {
    process.exitCode = exitCode;
  }
  const entry = { key, dir, files, vitest, output };
  kept.set(slot, entry);
  return entry;
}

/**
 * A kept Vitest's `file` changed, as its watcher would see it: its modules invalidated, its code
 * frames' source too (its logger caches each file's, see `Logger.highlight`). By its module id, as
 * the watcher gives it (`slash`ed: Vitest looks it up as it is).
 */
export const changed = (vitest: Vitest, file: string) => {
  const id = slash(file);
  vitest.invalidateFile(id);
  vitest.logger.clearHighlightCache(id);
};

/**
 * The files under `dir`, `node_modules` left out, links not followed. A slot's `node_modules` links
 * the plugin (the repository, its `tmp/e2e/` every scenario's folder, each linking it again) or is
 * Storybook's package: a recursive `readdir` that follows links walked those without end (on CI's
 * Node: every scenario after it stalled, or failed on a folder another worker removed).
 */
const filesOf = async (dir: string): Promise<string[]> => {
  const files: string[] = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory() && entry.name !== "node_modules") {
      files.push(...(await filesOf(file)));
    } else if (entry.isFile()) {
      files.push(file);
    }
  }
  return files;
};

/**
 * Runs the `features/` of the scenario's project `scenarioDir` in a kept Vitest (see `Kept`): the
 * previous scenario's files removed (all but `node_modules` and the key's), and the scenario's
 * copied in; its messages into `messages` if given (`./messages.ts`). Undefined if it has no feature
 * files to run: a new Vitest's run reports it.
 */
export async function runKept(
  { dir, files, vitest, output }: Kept,
  scenarioDir: string,
  messages?: Envelope[],
): Promise<RunResult | undefined> {
  for (const file of await filesOf(dir)) {
    if (!files.has(relative(dir, file))) {
      await rm(file);
      changed(vitest, file);
    }
  }
  const scenarioFiles = await readdir(path.join(scenarioDir, "features"), {
    recursive: true,
    withFileTypes: true,
  }).catch(() => []);
  for (const entry of scenarioFiles) {
    if (entry.isFile()) {
      const from = path.join(entry.parentPath, entry.name);
      const file = path.join(dir, relative(scenarioDir, from));
      await mkdir(path.dirname(file), { recursive: true });
      await copyFile(from, file);
      changed(vitest, file);
    }
  }
  vitest.clearSpecificationsCache();
  const specifications = await vitest.globTestSpecifications();
  if (specifications.length === 0) {
    return undefined;
  }
  output.clear();
  // Vitest sets the run's result as the process' exit code: this process' (see `startSession`).
  const { exitCode } = process;
  process.exitCode = undefined;
  const restoreExit = showExit(output);
  const stopCollecting = messages && collectMessages(vitest, messages);
  try {
    await vitest.runTestSpecifications(specifications);
    checkPluginModules(vitest);
    return runResult(
      vitest,
      dir,
      { exitCode: Number(process.exitCode ?? 0), output: output.text() },
      specifications,
    );
  } finally {
    stopCollecting?.();
    restoreExit();
    process.exitCode = exitCode;
  }
}
