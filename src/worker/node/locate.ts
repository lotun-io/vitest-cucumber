// Where node mode's support code calls were made: its recorded stacks, located as every host's
// (`../../utils/locateStacks.ts`, the internal directories main's, provided), parsed only: Vitest's
// runner already maps the worker's stacks to the sources (a `require`d file is Node's own: its
// positions as they are). None of Vitest's default ignored frames: one of them
// (`/packages/<name>/dist/`) is a monorepo package's own; the plugin's frames are cut by
// `locateStacks`. Node only.
import { parseStacktrace } from "@vitest/utils/source-map";
import path from "node:path";
import { inject } from "vitest";
import type {} from "../../types/providedContext.ts";
import { locateStacks } from "../../utils/locateStacks.ts";

/** The host's `locate` (`Host["locate"]`): `stacks`' locations, their paths from `cwd`. */
export const locate = async (stacks: (string | undefined)[], cwd: string) =>
  locateStacks(
    (stack) => parseStacktrace(stack, { ignoreStackEntries: [] }),
    stacks,
    {
      internalDirectories: inject("vitestCucumber").internalDirectories,
      relative: (file) => path.relative(cwd, file),
    },
  );
