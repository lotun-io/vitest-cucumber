// A project's support files. Cucumber's configuration leaves the `import` globs unresolved (the
// plugin passes no `require` on), so they're expanded here (with tinyglobby, like Vitest's
// `include`); a folder means its support files, every extension Vite transforms (TypeScript
// included). With none given, no support code is loaded, in every mode: unlike cucumber, which
// defaults to each feature file's closest `features` folder or its own, everything in it (in
// Storybook a feature file's folder holds its stories and components; most projects set `import`
// anyway, cucumber's default being JavaScript only). The steps are then undefined, with snippets.
import type { IConfiguration } from "@cucumber/cucumber/api";
import { glob } from "tinyglobby";

/** The support files inside a folder, by extension. */
const supportFilesGlob = "**/*.@(ts|mts|cts|tsx|js|mjs|cjs|jsx)";

/**
 * The support files of `configuration`'s `import` globs, absolute, from `root` (none given, none
 * loaded): a folder replaced by its support files, each file once. Each glob's files are sorted and
 * the globs kept in order, since that's the definitions' order.
 */
export const supportFilesOf = async (
  root: string,
  configuration: IConfiguration,
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
