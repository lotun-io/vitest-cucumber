// Where the support code's calls were made, every host's (`Actions["locate"]`'s answer): each
// recorded stack's first frame that isn't internal, as the host parses it (and maps it, where it
// isn't already), its path from the project's root as the host makes it (Node's `path.relative`),
// with `/` on every platform, as Vitest writes paths (`\` on Windows otherwise). The internal
// directories are main's (`../core/plugin/frames.ts`). Hosts: node mode's worker
// (`../worker/node/locate.ts`: its stacks already mapped, the directories provided by main), browser
// mode's main (`../core/commands/locate.ts`: Vitest's parser and maps), Storybook's dev server
// (`../core/storybook/preset/locate.ts`: its maps). Page-safe.
import type { ParsedStack } from "@vitest/utils";
import type { Actions } from "../types/commands.ts";
import { slash } from "./slash.ts";

/** Whether `file` (a frame's) is in one of `directories` (each with `/`, ending in `/`). */
export const isInDirectories = (
  directories: readonly string[],
  file: string,
) => {
  const slashed = slash(file);
  return directories.some((dir) => slashed.startsWith(dir));
};

/** How a host reads a frame: the internal directories, and a file's path from the project's root. */
interface FrameReading {
  internalDirectories: readonly string[];
  relative: (file: string) => string;
}

/** Each of `stacks`' location: its first frame outside `internalDirectories`, as `parse` gives it. */
export const locateStacks = (
  parse: (stack: string) => ParsedStack[],
  stacks: Actions["locate"][0]["stacks"],
  { internalDirectories, relative }: FrameReading,
): Actions["locate"][1] =>
  stacks.map((stack) => {
    const frame =
      stack === undefined
        ? undefined
        : parse(stack).find(
            ({ file }) => !isInDirectories(internalDirectories, file),
          );
    return frame
      ? {
          uri: slash(relative(frame.file)),
          line: frame.line,
          column: frame.column,
        }
      : undefined;
  });
