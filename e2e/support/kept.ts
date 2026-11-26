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
import { writeConfig } from "./config.ts";
import {
  linkOnce,
  linkStorybookModules,
  packagesOf,
  storybookModules,
  writePackages,
} from "./packages.ts";
import { normalize, relative, slash } from "./paths.ts";
import { CONFIG, defaultConfig, defaultStorybookConfig } from "./project.ts";
import {
  collectGarbage,
  type OpenVitest,
  openVitestIn,
  runTestFiles,
  testFilesOf,
} from "./run.ts";
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
interface Kept extends OpenVitest {
  key: string;
  dir: string;
  /** Its files outside `features/`, by name: its key's. */
  files: Map<string, string>;
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
 * Removes the dependency caches of the project in `dir`, a folder with a `node_modules` of its
 * own: Vite's (`node_modules/.vite`), and its story tests', which Storybook's addon keeps in this
 * process's own `node_modules` (the repository's), by the config folder's path (the addon's own
 * two functions give the folder: `storybook/internal`, as it reads it).
 */
const removeCaches = async (dir: string) => {
  await rm(path.join(dir, "node_modules", ".vite"), removeOptions);
  const { resolvePathInStorybookCache } =
    await import("storybook/internal/common");
  const { oneWayHash } = await import("storybook/internal/telemetry");
  await rm(
    resolvePathInStorybookCache(
      "sb-vitest",
      oneWayHash(path.join(dir, ".storybook")),
    ),
    removeOptions,
  );
};

const removeOptions = { recursive: true, force: true };

/**
 * Makes `dir` a slot's folder for a new Vitest in `mode`: everything removed but its `node_modules`
 * (its dependency caches) when that is the folder's kind. A Storybook project's is a link to
 * `storybook/`'s; any other's a folder with the plugin linked in it; a Storybook project with
 * packages of the scenario's own (`packaged`: a folder of its own, see `runDirFor`), a folder
 * with each thing of `storybook/`'s linked in it, so the scenario's packages can be next to them
 * (never written into `storybook/`'s). A folder's packages of an earlier scenario are taken out
 * (what is neither a link nor a cache).
 */
const prepareDir = async (dir: string, mode: string, packaged = false) => {
  await mkdir(dir, { recursive: true });
  const modules = path.join(dir, "node_modules");
  const storybook = mode === "storybook";
  const link = storybook && !packaged;
  const linked = await lstat(modules).then(
    (stats) => stats.isSymbolicLink(),
    () => undefined,
  );
  for (const entry of await readdir(dir)) {
    if (entry !== "node_modules" || linked !== link) {
      await rm(path.join(dir, entry), { recursive: true, force: true });
    }
  }
  if (link) {
    if (!linked) {
      await symlink(storybookModules, modules, "dir");
    }
    return;
  }
  await mkdir(modules, { recursive: true });
  let removed = false;
  for (const entry of await readdir(modules, { withFileTypes: true })) {
    // The cache (`.vite`), the links and the plugin's folder stay.
    if (
      !entry.name.startsWith(".") &&
      !entry.isSymbolicLink() &&
      entry.name !== "@lotun"
    ) {
      await rm(path.join(modules, entry.name), {
        recursive: true,
        force: true,
      });
      removed = true;
    }
  }
  if (removed) {
    // The caches list the packages pre-bundled, a removed one among them (Vite then fails
    // reading it: no lockfile here says the packages changed).
    await removeCaches(dir);
  }
  if (storybook) {
    await linkStorybookModules(modules);
  } else {
    await linkOnce(
      path.resolve(),
      path.join(modules, "@lotun/vitest-cucumber"),
    );
  }
};

/**
 * A run folder of this worker for a one-off run in `mode` (a new Vitest's: `./runVitest.ts`),
 * with the scenario's project `scenarioDir` copied in (all but its `node_modules`) and its own
 * packages written into the folder's (`files`: the scenario's, `inPackages`). One per mode, and
 * one more for a Storybook project with packages (its `node_modules` another kind: `prepareDir`),
 * reused, its `node_modules` kept: the dependency caches stay warm, as a kept slot's. `cold`,
 * or with packages of its own: those caches removed first, as a first run's are; not a
 * Storybook project's without packages, whose caches are `storybook/`'s, every worker's.
 */
export const runDirFor = async (
  scenarioDir: string,
  mode: string,
  { files, cold = false }: { files: Map<string, string>; cold?: boolean },
) => {
  const packages = packagesOf(files);
  const packaged = packages.length > 0;
  const dir = path.resolve(
    "tmp",
    "e2e",
    "run",
    `${workerName}-${mode}${packaged && mode === "storybook" ? "-packages" : ""}`,
  );
  await prepareDir(dir, mode, packaged);
  const modules = path.join(scenarioDir, "node_modules");
  await cp(scenarioDir, dir, {
    recursive: true,
    filter: (source) => source !== modules,
  });
  await writePackages(dir, packages);
  if (cold && mode === "storybook" && !packaged) {
    throw new Error(
      "A Storybook project's dependency caches are storybook/'s, every worker's: not removed (a scenario with a package of its own has its own)",
    );
  }
  // With packages of its own, always: a cache of an earlier run has them as they were then.
  if (cold || packaged) {
    await removeCaches(dir);
  }
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
  const { exitCode } = process;
  let open: OpenVitest;
  try {
    open = await openVitestIn(dir);
  } catch {
    return undefined;
  } finally {
    process.exitCode = exitCode;
  }
  const entry = { key, dir, files, ...open };
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
  const specifications = await testFilesOf(vitest);
  return specifications.length === 0
    ? undefined
    : runTestFiles({ vitest, output }, dir, specifications, messages);
}
