// Storybook: a file's import path, as Storybook's index writes it (a story's `parameters.fileName`,
// its index entries' `importPath`). Storybook's own process only.
import path from "node:path";
import { slash } from "../../../utils/slash.ts";

/**
 * A file's import path in Storybook's index: from Storybook's working directory, with `./` (its
 * `toImportPath`, `storybook/internal/core-server`), not from the config folder's parent: from a
 * monorepo's root, `storybook dev -c packages/ui/.storybook` writes `./packages/ui/src/…`.
 */
export const importPathOf = (file: string) => {
  const relative = slash(path.relative(process.cwd(), file));
  return relative.startsWith(".") ? relative : `./${relative}`;
};
