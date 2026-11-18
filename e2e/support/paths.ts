// Paths as Vitest writes them: with `/` on every platform, as its `pathe` gives them (Node's `path`
// gives `\` on Windows). The scenarios' file names, Vitest's module ids and its frames' files are
// all this way, so the harness compares them this way; Node's own file functions take either.
import { slash } from "@vitest/utils/helpers";
import path from "node:path";

export { slash };

export const resolve = (...paths: string[]) => slash(path.resolve(...paths));

export const relative = (from: string, to: string) =>
  slash(path.relative(from, to));

export const join = (...paths: string[]) => slash(path.join(...paths));

/** A scenario's name for a file (`features/a.feature`): relative to its project, `.` and `..` resolved. */
export const normalize = (name: string) => slash(path.normalize(name));
