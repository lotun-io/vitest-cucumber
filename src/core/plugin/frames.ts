// Stack filtering: a test's error is printed without the frames below the user's code, as cucumber's
// `filterStacktraces` does. Internal frames are the plugin's (its runtime among them) and the
// cucumber packages its runtime runs on, which call the user's code (`@cucumber/core`, and
// `@cucumber/cucumber-expressions`: a parameter type's transformer). An error whose first frame is
// internal (e.g. the runtime's timeout) is kept whole. Browser mode's frames of those packages are
// Vite's pre-bundled chunks, which Vitest leaves unmapped (its bug): not filtered.
import { createRequire } from "node:module";
import path from "node:path";
import type { TestProject } from "vitest/node";
import { isInDirectories } from "../../utils/locateStacks.ts";
import { slash } from "../../utils/slash.ts";
import { ownRoot } from "../utils/ownModule.ts";

const require = createRequire(import.meta.url);

/**
 * The internal directories, with `/`: the frame filter's, and every host's locations'
 * (`../../utils/locateStacks.ts`; node mode's workers get them provided).
 */
export const internalDirectories = [
  ...["@cucumber/core", "@cucumber/cucumber-expressions"].map((name) =>
    path.dirname(require.resolve(`${name}/package.json`)),
  ),
  // This package's `src/` and `dist/`.
  ...["src", "dist"].map((dir) => path.join(path.dirname(ownRoot), dir)),
].map((dir) => `${slash(dir)}/`);

/** Whether `file` (a frame's) is internal. */
export const isInternalFile = (file: string) =>
  isInDirectories(internalDirectories, file);

/** Vitest's frame filter (its `onStackTrace` option). */
type FrameFilter = NonNullable<TestProject["config"]["onStackTrace"]>;

/**
 * The project's `onStackTrace`: the user's filter first, then ours if `filtering` (not with
 * cucumber's `backtrace`). Vitest asks
 * frame by frame, in order, once per error, so each error keeps a state: `open` (only user frames
 * so far), `cut` (past the first internal frame), or `keep` (its first frame was internal). Set in
 * the `config` hook, before Vitest resolves it, because the browser server copies it at that point.
 */
export const frameFilterOf = (
  onStackTrace: FrameFilter | undefined,
  filtering: boolean,
): FrameFilter => {
  const states = new WeakMap<object, "open" | "cut" | "keep">();
  return (error, frame) => {
    if (onStackTrace?.(error, frame) === false) {
      return false;
    }
    if (!filtering) {
      return true;
    }
    const state = states.get(error);
    if (state === "cut" || state === "keep") {
      return state === "keep";
    }
    if (!isInternalFile(frame.file)) {
      states.set(error, "open");
      return true;
    }
    states.set(error, state === undefined ? "keep" : "cut");
    return state === undefined;
  };
};
