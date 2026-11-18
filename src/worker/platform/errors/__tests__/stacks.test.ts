import { describe, expect, test } from "vitest";
import { errorAt, frameAt, withStepFrame } from "../stacks.ts";

const step = frameAt("/project/features/a.feature", { line: 3, column: 5 });
/** The step's frame as a V8 stack line. */
const stepLine = "    at /project/features/a.feature:3:5";

test("frameAt: the frame at the location, column 1 by default", () => {
  expect(frameAt("/p/a.feature", { line: 7 })).toEqual({
    file: "/p/a.feature",
    line: 7,
    column: 1,
  });
});

test("errorAt: the message, the frame as its only one, the cause", () => {
  const error = errorAt("Given a step", step, "the cause");
  expect(error.stack).toBe(`Error: Given a step\n${stepLine}`);
  expect(error.cause).toBe("the cause");
  expect(errorAt("no frame", undefined, undefined).stack).toBe(
    "Error: no frame",
  );
});

describe("withStepFrame", () => {
  test("V8: the step's frame after the header, before the error's own frames", () => {
    expect(
      withStepFrame(
        "Error: Step failed\n    at step (/p/steps.ts:4:9)\n    at run (/p/x.ts:1:1)",
        step,
      ),
    ).toBe(
      `Error: Step failed\n${stepLine}\n    at step (/p/steps.ts:4:9)\n    at run (/p/x.ts:1:1)`,
    );
  });

  test("a multi-line message stays the header", () => {
    expect(
      withStepFrame(
        "Error: line one\nline two\n    at step (/p/steps.ts:4:9)",
        step,
      ),
    ).toBe(
      `Error: line one\nline two\n${stepLine}\n    at step (/p/steps.ts:4:9)`,
    );
  });

  // Real stacks (Firefox 141, WebKit 26, via Playwright): each engine's frames stay as they are,
  // the step's first, in their format, so Vitest parses the whole stack as theirs.
  test("Firefox: the frame first, as `@location`; its own frames as they are", () => {
    const stack = [
      "evaled@http://localhost:5173/@fs/code.js line 6 > eval:1:28",
      "viaEval@http://localhost:5173/@fs/code.js:6:30",
      "async*@http://localhost:5173/:6:15",
      "",
    ].join("\n");
    expect(withStepFrame(stack, step)).toBe(
      `@/project/features/a.feature:3:5\n${stack}`,
    );
  });

  test("Safari: the frame first, before frames without a location (eval's, native code)", () => {
    const stack = [
      "evaled@",
      "eval code@",
      "eval@[native code]",
      "viaEval@http://localhost:5173/@fs/code.js:6:34",
      "module code@http://localhost:5173/:6:17",
    ].join("\n");
    expect(withStepFrame(stack, step)).toBe(
      `@/project/features/a.feature:3:5\n${stack}`,
    );
  });

  test("V8 with a frame from native code: after the header, the frames as they are", () => {
    const stack = [
      "Error: map",
      "    at inMap (http://localhost:5173/@fs/code.js:5:62)",
      "    at Array.map (<anonymous>)",
      "    at viaMap (http://localhost:5173/@fs/code.js:5:33)",
    ].join("\n");
    const [header, ...frames] = stack.split("\n");
    expect(withStepFrame(stack, step)).toBe(
      [header, stepLine, ...frames].join("\n"),
    );
  });

  test("a message line that starts like a frame stays the header (a V8 frame needs a location)", () => {
    expect(
      withStepFrame(
        "Error: failed\n    at the gate\n    at step (/p/steps.ts:4:9)",
        step,
      ),
    ).toBe(
      `Error: failed\n    at the gate\n${stepLine}\n    at step (/p/steps.ts:4:9)`,
    );
  });

  test("a stack without frames: the frame after it", () => {
    expect(withStepFrame("Error: Step failed", step)).toBe(
      `Error: Step failed\n${stepLine}`,
    );
  });
});
