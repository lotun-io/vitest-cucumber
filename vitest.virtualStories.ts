// The root features' stories files, virtual (repo-only, for the root suite's `storybook` project): a
// feature file runs on the stories file next to it, and `features/` has none, so each
// `features/**/<name>.stories.ts` of a `<name>.feature` is a meta only (`render: () => null`: nothing
// to render, the steps are the story; no title: Storybook's automatic one of the feature's path). The
// plugin finds and reads it with `node:fs` (`existsSync`, `readFile`: patched in Vitest's process,
// their ES exports synced), the feature's module imports it through Vite (the returned plugin). The
// features stay plain Gherkin.
import fs from "node:fs";
import fsPromises from "node:fs/promises";
import { syncBuiltinESMExports } from "node:module";
import path from "node:path";
import type { Plugin } from "vitest/config";

const storiesMeta = "export default { render: () => null };\n";

/** Makes the stories files of `features`' feature files virtual: patches `node:fs`, gives the Vite plugin. */
export const virtualStories = (features: string): Plugin => {
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
        return Promise.resolve(text ? storiesMeta : Buffer.from(storiesMeta));
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
    load: (id) => (isVirtualStories(id) ? storiesMeta : undefined),
  };
};
