// Where a browser mode page's support code calls were made (main's side of `Actions["locate"]`):
// its recorded stacks parsed and mapped by Vitest's parser, with its server's source maps, located as
// every host's (`../../utils/locateStacks.ts`).
import path from "node:path";
import type { TestProject } from "vitest/node";
import type { Actions } from "../../types/commands.ts";
import { locateStacks } from "../../utils/locateStacks.ts";
import { internalDirectories } from "../plugin/frames.ts";

export const locate = (
  project: TestProject,
  cwd: string,
  { stacks }: Actions["locate"][0],
): Actions["locate"][1] =>
  locateStacks(
    // None of Vitest's default ignored frames (as node mode's: `../../worker/node/locate.ts`), its
    // maps and ids kept.
    (stack) =>
      project.browser?.parseStacktrace(stack, { ignoreStackEntries: [] }) ?? [],
    stacks,
    { internalDirectories, relative: (file) => path.relative(cwd, file) },
  );
