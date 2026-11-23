import { createRequire } from "node:module";
import path from "node:path";
import { describe, expect, test } from "vitest";
import { slash } from "../../../utils/slash.ts";
import { frameFilterOf, isInternalFile } from "../frames.ts";

/** The directory of the package `name`, with `/`. */
const packageRoot = (name: string) =>
  slash(
    path.dirname(
      createRequire(import.meta.url).resolve(`${name}/package.json`),
    ),
  );
const expressionsRoot = packageRoot("@cucumber/cucumber-expressions");

describe("isInternalFile", () => {
  test("anything in the runtime's cucumber packages", () => {
    expect(
      isInternalFile(`${packageRoot("@cucumber/core")}/dist/index.js`),
    ).toBe(true);
    expect(isInternalFile(`${expressionsRoot}/src/ParameterType.ts`)).toBe(
      true,
    );
  });

  test("not cucumber's own package (no cucumber code runs in the worker)", () => {
    expect(
      isInternalFile(`${packageRoot("@cucumber/cucumber")}/lib/index.js`),
    ).toBe(false);
  });

  test("the plugin's own", () => {
    expect(isInternalFile(slash(import.meta.filename))).toBe(true);
  });

  test("not a package beside one of them (its name a prefix), nor the user's", () => {
    expect(isInternalFile(`${expressionsRoot}-more/dist/index.js`)).toBe(false);
    expect(isInternalFile("/project/features/steps.ts")).toBe(false);
  });
});

describe("frameFilterOf (each error's frames, in order, as Vitest asks)", () => {
  const cucumberFile = slash(
    createRequire(import.meta.url).resolve("@cucumber/core"),
  );
  const user = (file: string) => ({
    file,
    line: 1,
    column: 1,
    method: "",
  });
  const internal = user(cucumberFile);

  /** The frames `filter` keeps of one error's `frames`. */
  const kept = (
    filter: ReturnType<typeof frameFilterOf>,
    frames: ReturnType<typeof user>[],
  ) => {
    const error = { message: "an error" };
    return frames.filter((frame) => filter(error as never, frame));
  };

  test("the user's frames, cut at the first internal one", () => {
    const filter = frameFilterOf(undefined, true);
    expect(
      kept(filter, [
        user("/p/steps.ts"),
        user("/p/helper.ts"),
        internal,
        user("/p/later.ts"),
      ]),
    ).toEqual([user("/p/steps.ts"), user("/p/helper.ts")]);
  });

  test("an error whose first frame is internal (e.g. cucumber's timeout): kept whole", () => {
    const filter = frameFilterOf(undefined, true);
    expect(kept(filter, [internal, user("/p/steps.ts")])).toEqual([
      internal,
      user("/p/steps.ts"),
    ]);
  });

  test("each error its own: one cut doesn't cut the next", () => {
    const filter = frameFilterOf(undefined, true);
    kept(filter, [user("/p/a.ts"), internal]);
    expect(kept(filter, [user("/p/b.ts"), user("/p/c.ts")])).toHaveLength(2);
  });

  test("without filtering (`backtrace`): every frame", () => {
    const filter = frameFilterOf(undefined, false);
    expect(
      kept(filter, [user("/p/a.ts"), internal, user("/p/b.ts")]),
    ).toHaveLength(3);
  });

  test("the user's `onStackTrace` first: its `false` leaves a frame out, ours then applies", () => {
    const filter = frameFilterOf(
      (_error, { file }) => !file.endsWith("/helper.ts"),
      true,
    );
    expect(
      kept(filter, [
        user("/p/steps.ts"),
        user("/p/helper.ts"),
        user("/p/more.ts"),
        internal,
      ]),
    ).toEqual([user("/p/steps.ts"), user("/p/more.ts")]);
  });

  test("the user's `onStackTrace` without filtering: only theirs applies", () => {
    const filter = frameFilterOf(
      (_error, { file }) => !file.endsWith("/helper.ts"),
      false,
    );
    expect(kept(filter, [user("/p/helper.ts"), internal])).toEqual([internal]);
  });
});
