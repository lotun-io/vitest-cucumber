// A scenario's project as a Storybook project (`tmp/e2e/<scenario>/`), as a user's: its own Vitest
// config (the addon's project: `./project.ts`'s `defaultStorybookConfig`), its Storybook config
// (`.storybook/`: the plugin's addon entry with the scenario's options), its `node_modules`
// `storybook/`'s (Storybook, React, the plugin from `src/`).
// Its stories are its feature files (`.storybook/main.ts`, a glob): each one a stories module of its
// own, on the stories file next to it; in `storybook` mode, each feature file (anywhere but
// `node_modules`) without a stories file next to it is given one (a meta only, `<name>.stories.tsx`:
// out of the support code's `features/**/*.ts`). A feature file is its own story tests' test file,
// its tests named as node and browser mode name them: its run is read as it is (`asFeatureRun`: the
// addon's debug links taken out).
import { rm, symlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { glob } from "tinyglobby";
import { linkStorybookModules, packagesOf, writePackages } from "./packages.ts";
import type { E2EWorld, RunResult } from "./world.ts";

/** The Storybook project's package (its `node_modules`). */
export const storybookPackage = path.resolve("storybook");

/**
 * Storybook's config of a scenario's project (`.storybook/`), by name: the feature files of the folders
 * the scenarios put them in (`features/`, `src/`, `specs/`), one glob (Storybook
 * warns of a pattern matching no file), the same for every scenario, so its story tests can run in a kept Vitest (`./kept.ts`: its key is its
 * files outside `features/`). Never the whole project: the addon makes the globs Vitest's `include`
 * as they are, and the linked `node_modules` has Storybook's React template's stories; nor a glob
 * naming `node_modules` to leave it out: Storybook then drops its own exclusion of it, and indexes
 * pnpm's linked packages (it hangs).
 */
export const storybookFiles = (options: E2EWorld["pluginOptions"]) => ({
  // The plugin's addon entry, with the scenario's options (Storybook's and its story tests').
  ".storybook/main.ts": `import { cucumber } from "@lotun/vitest-cucumber/storybook/node";
import type { StorybookConfig } from "@storybook/react-vite";

const config: StorybookConfig = {
  stories: ["../{features,src,specs}/**/*.{feature,feature.md}"],
  addons: [
    "@storybook/addon-vitest",
    cucumber(${JSON.stringify({ import: ["features/**/*.ts"], ...options })}),
  ],
  framework: "@storybook/react-vite",
};

export default config;
`,
  ".storybook/preview.ts": "export default {};\n",
});

/** Writes Storybook's config (`.storybook/`), as the scenario's files (`this.files`: a kept Vitest's too). */
async function writeStorybookFiles(this: E2EWorld) {
  for (const [name, content] of Object.entries(
    storybookFiles(this.pluginOptions),
  )) {
    await this.write(name, content);
  }
}

/** Makes the scenario's project a Storybook project: its `node_modules`, Storybook's config. */
export async function useStorybookProject(this: E2EWorld) {
  const modules = path.join(this.dir, "node_modules");
  await rm(modules, { recursive: true, force: true });
  await symlink(path.join(storybookPackage, "node_modules"), modules, "dir");
  await writeStorybookFiles.call(this);
}

/**
 * Before Storybook's own program runs in the scenario's folder (`storybook build`, `storybook dev`:
 * a story-test run has its folder, `./kept.ts`): a scenario with packages of its own gets them,
 * its `node_modules` a folder linking each thing of `storybook/`'s instead of the one link
 * (`./packages.ts`), and a `package.json`, so Storybook keeps its caches in that folder (the
 * nearest package's `node_modules`: else the repository's, by the config folder's path, an
 * earlier run's package pre-bundled as it was then). Any other scenario is left as it is.
 */
export async function withOwnPackages(this: E2EWorld) {
  const packages = packagesOf(this.files);
  if (packages.length === 0) {
    return;
  }
  const modules = path.join(this.dir, "node_modules");
  await rm(modules, { recursive: true, force: true });
  await linkStorybookModules(modules);
  await writePackages(this.dir, packages);
  if (!this.files.has("package.json")) {
    await writeFile(
      this.file("package.json"),
      JSON.stringify({ name: "e2e-storybook", private: true, type: "module" }),
    );
  }
}

/**
 * `text` without the addon's link before a failed story test's message (its setup file's
 * `afterEach`: "Click to debug the error directly in Storybook: <url>", then an empty line), so its
 * message reads as a feature file's test's.
 */
const withoutDebugLinks = (text: string) =>
  text.replaceAll(
    /\n(?:\u001b\[\d+m)?Click to debug the error directly in Storybook: [^\n]*\n\n/g,
    "",
  );

/** A feature file's stories file (`a.feature` → `a.stories.tsx`). */
const storiesFileOf = (feature: string) =>
  feature.replace(/\.feature(\.md)?$/, ".stories.tsx");

/**
 * The title of a feature file's stories file: the feature's path in the project without its last
 * extension (`features/a.feature` → `features/a`). No `stories` pattern lists the stories file,
 * so it writes one (the plugin takes a feature's title from its stories file).
 */
const titleOf = (feature: string) => feature.replace(/\.[^./]+$/, "");

/** The scenario's own stories file next to `feature` (any but the one this file writes), if any. */
const ownStoriesFileOf = async (dir: string, feature: string) =>
  (
    await glob(
      `${feature.replace(/\.feature(\.md)?$/, "")}.stories.{ts,tsx,js,jsx,mts,mjs,cts,cjs}`,
      { cwd: dir, ignore: [storiesFileOf(feature)] },
    )
  )[0];

/**
 * Gives each of the project's feature files without a stories file of the scenario's own its stories
 * file (a meta only, with its title), and Storybook's config as the plugin's options are now: `asFeatureRun`, a run
 * read as a feature file's (the addon's debug links taken out of its output and errors).
 */
export async function featureStoriesFiles(this: E2EWorld) {
  const features = await glob("**/*.{feature,feature.md}", {
    cwd: this.dir,
    ignore: ["node_modules/**"],
  });
  // Storybook's config, as the plugin's options are now (a step may have set them since).
  await writeStorybookFiles.call(this);
  for (const feature of features) {
    if (!(await ownStoriesFileOf(this.dir, feature))) {
      // As the scenario's own files (a kept Vitest gets them: `./kept.ts`).
      await this.write(
        storiesFileOf(feature),
        `export default { title: ${JSON.stringify(titleOf(feature))}, render: () => null };\n`,
      );
    }
  }
  return async (result: RunResult): Promise<RunResult> => ({
    ...result,
    output: withoutDebugLinks(result.output),
    tests: result.tests.map((test) => ({
      ...test,
      errors: test.errors.map(withoutDebugLinks),
    })),
  });
}

/**
 * How the scenario's runs are read, asked before its first one: a Storybook project's as its
 * feature files' (`featureStoriesFiles`, which writes what the run needs first), any other's as
 * they are.
 */
export async function runAs(
  this: E2EWorld,
): Promise<(result: RunResult) => Promise<RunResult>> {
  return this.mode === "storybook"
    ? featureStoriesFiles.call(this)
    : (result) => Promise.resolve(result);
}
