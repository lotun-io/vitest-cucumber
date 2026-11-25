// A project's support files: the `import` option's globs, expanded here (with tinyglobby, like
// Vitest's `include`); a folder means its support files, every extension Vite transforms (TypeScript
// included). The option is required (`../plugin/options.ts`), in every mode: cucumber's default
// isn't taken (each feature file's closest `features` folder or its own, everything in it: in
// Storybook a feature file's folder holds its stories and components, and cucumber's default is
// JavaScript only). An empty list loads no support code: the steps are undefined, with snippets.
import { glob } from "tinyglobby";
import type { Configuration } from "../plugin/options.ts";

/** The support files inside a folder, by extension. */
const supportFilesGlob = "**/*.@(ts|mts|cts|tsx|js|mjs|cjs|jsx)";

/**
 * The support files of `configuration`'s `import` globs, absolute, from `root` (an empty
 * list: none): a folder replaced by its support files, each file once. Each glob's files are sorted and
 * the globs kept in order, since that's the definitions' order.
 */
export const supportFilesOf = async (
  root: string,
  configuration: Configuration,
) => {
  const files = await Promise.all(
    configuration.import.map(async (pattern) =>
      (
        await glob([pattern, `${pattern}/${supportFilesGlob}`], {
          cwd: root,
          absolute: true,
          dot: true,
          expandDirectories: false,
        })
      ).sort(),
    ),
  );
  return [...new Set(files.flat())];
};
