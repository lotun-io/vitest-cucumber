// The root features' stories files, virtual (repo-only, for the root suite's `storybook` project): a
// feature file runs on the stories file next to it, and `features/` has none, so each
// `features/**/<name>.stories.ts` of a `<name>.feature` is a meta only (`render: () => null`: nothing
// to render, the steps are the story; its title `Example`, then its path under `features/`: no
// `stories` pattern lists it, so it writes one, each file its own). The
// plugin finds and reads it with `node:fs` (`existsSync`, `readFile`: patched in Vitest's process,
// their ES exports synced), the feature's module imports it through Vite (the returned plugin). The
// features stay plain Gherkin.
import fs from "node:fs";
import fsPromises from "node:fs/promises";
import { syncBuiltinESMExports } from "node:module";
import path from "node:path";
import type { Plugin } from "vitest/config";

/** Makes the stories files of `features`' feature files virtual: patches `node:fs`, gives the Vite plugin. */
export const virtualStories = (features: string): Plugin => {
  /**
   * A virtual stories file's text: a meta only, its title by its path under `features` (two
   * features of one name in two folders stay apart: `Example/simple`, `Example/fail/simple`).
   */
  const storiesMetaOf = (file: string) => {
    const own = path.resolve(file.split("?")[0] ?? file);
    const name = path
      .relative(features, own)
      .replace(/\.stories\.ts$/, "")
      .split(path.sep)
      .join("/");
    return `export default { title: ${JSON.stringify(`Example/${name}`)}, render: () => null };\n`;
  };
  const realExists = fs.existsSync;
  const realReadFile = fsPromises.readFile;
  /** Whether `file` is a virtual stories file (none on disk, a feature file next to it). */
  const isVirtualStories = (file: string) => {
    const own = path.resolve(file.split("?")[0] ?? file);
    return (
      own.startsWith(`${features}${path.sep}`) &&
      own.endsWith(".stories.ts") &&
      !realExists(own) &&
      realExists(own.replace(/\.stories\.ts$/, ".feature"))
    );
  };
  Object.assign(fs, {
    existsSync: (file: fs.PathLike) =>
      (typeof file === "string" && isVirtualStories(file)) || realExists(file),
  });
  Object.assign(fsPromises, {
    readFile: (...args: Parameters<typeof realReadFile>) => {
      const [file, options] = args;
      if (typeof file === "string" && isVirtualStories(file)) {
        const text = typeof options === "string" || options?.encoding;
        const meta = storiesMetaOf(file);
        return Promise.resolve(text ? meta : Buffer.from(meta));
      }
      return realReadFile(...args);
    },
  });
  syncBuiltinESMExports();
  return {
    name: "repo:virtual-stories",
    enforce: "pre",
    resolveId: (source, importer) => {
      if (!importer || !source.endsWith(".stories.ts")) {
        return undefined;
      }
      const file = path.resolve(
        path.dirname(importer.split("?")[0] ?? ""),
        source,
      );
      return isVirtualStories(file) ? file : undefined;
    },
    load: (id) => (isVirtualStories(id) ? storiesMetaOf(id) : undefined),
  };
};
