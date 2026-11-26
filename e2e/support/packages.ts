// A scenario's own packages: the files it writes into `node_modules` (`Given a file named
// "node_modules/…"`), e.g. a package of steps its support code imports. They are kept
// (`E2EWorld["write"]`), never written into the scenario's folder as they come: a Storybook
// project's `node_modules` is a link to `storybook/`'s, the repository's own install. Where a
// project needs them, its `node_modules` is a folder: the plugin linked in it, or, a Storybook
// project's, each thing of `storybook/`'s linked in it, the packages next to them
// (`./kept.ts`'s run folders; a Storybook project's own folder before it's built or served:
// `./storybookProject.ts`).
import { lstat, mkdir, readdir, symlink, writeFile } from "node:fs/promises";
import path from "node:path";

/** Whether `name` (relative to the project) is of a package of the scenario's own. */
export const inPackages = (name: string) =>
  name.split("/")[0] === "node_modules";

/** The scenario's own packages' files, of its `files`. */
export const packagesOf = (files: Map<string, string>) =>
  [...files].filter(([name]) => inPackages(name));

/** `storybook/`'s `node_modules`: Storybook, React, the plugin. */
export const storybookModules = path.resolve("storybook", "node_modules");

/** Links `to` at `link`, if nothing is there. */
export const linkOnce = async (to: string, link: string) => {
  if (!(await lstat(link).catch(() => undefined))) {
    await mkdir(path.dirname(link), { recursive: true });
    await symlink(to, link, "dir");
  }
};

/** Makes `modules` a folder with each thing of `storybook/`'s `node_modules` linked in it (its caches aside). */
export const linkStorybookModules = async (modules: string) => {
  await mkdir(modules, { recursive: true });
  for (const name of await readdir(storybookModules)) {
    if (!name.startsWith(".")) {
      await linkOnce(
        path.join(storybookModules, name),
        path.join(modules, name),
      );
    }
  }
};

/** Writes the package files `packages` into the project in `dir` (its `node_modules` a folder). */
export const writePackages = async (
  dir: string,
  packages: readonly (readonly [string, string])[],
) => {
  for (const [name, content] of packages) {
    await mkdir(path.dirname(path.join(dir, name)), { recursive: true });
    await writeFile(path.join(dir, name), content);
  }
};
