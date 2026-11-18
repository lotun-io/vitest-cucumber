import { describe, expect, test } from "vitest";
import { isInDirectories, locateStacks } from "../locateStacks.ts";

const frame = (file: string, line = 1) => ({
  file,
  line,
  column: 2,
  method: "",
});

describe("isInDirectories", () => {
  test("a file in a directory, with `\\` or `/`", () => {
    expect(isInDirectories(["C:/plugin/"], "C:\\plugin\\dist\\a.js")).toBe(
      true,
    );
    expect(isInDirectories(["/plugin/"], "/plugin/src/a.ts")).toBe(true);
  });

  test("not a directory beside it (its name a prefix)", () => {
    expect(isInDirectories(["/plugin/"], "/plugin-more/a.ts")).toBe(false);
  });
});

describe("locateStacks", () => {
  const reading = {
    internalDirectories: ["/plugin/"],
    relative: (file: string) => file.replace("/project/", ""),
  };

  test("each stack's first frame outside the internal directories, its path the host's", () => {
    const stacks: Record<string, ReturnType<typeof frame>[]> = {
      a: [frame("/plugin/src/registry.ts"), frame("/project/steps.ts", 4)],
      b: [frame("/project/other.ts", 7)],
    };
    expect(
      locateStacks((stack) => stacks[stack] ?? [], ["a", "b"], reading),
    ).toEqual([
      { uri: "steps.ts", line: 4, column: 2 },
      { uri: "other.ts", line: 7, column: 2 },
    ]);
  });

  test("its path with `/`, whatever the host's separator (Windows' `\\`)", () => {
    expect(
      locateStacks(() => [frame("/project/features/steps.ts", 4)], ["a"], {
        internalDirectories: [],
        relative: () => "features\\support\\steps.ts",
      }),
    ).toEqual([{ uri: "features/support/steps.ts", line: 4, column: 2 }]);
  });

  test("none for a missing stack, or one with only internal frames", () => {
    expect(
      locateStacks(
        () => [frame("/plugin/src/registry.ts")],
        [undefined, "c"],
        reading,
      ),
    ).toEqual([undefined, undefined]);
  });
});
