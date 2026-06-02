import { describe, it, expect } from "vitest";
import { createError } from "../createError.ts";
import { TestStepResultStatus } from "@cucumber/messages";

describe("createError", () => {
  it("uses stepResult message when available", () => {
    const err = createError({
      id: "features/test.feature",
      line: 5,
      result: {
        status: "FAILED",
        stepResult: {
          status: TestStepResultStatus.FAILED,
          message: "step failed",
          duration: { seconds: 0, nanos: 0 },
        },
      },
    });
    expect(err.message).toBe("step failed");
  });

  it("falls back to status when stepResult message is absent", () => {
    const err = createError({
      id: "features/test.feature",
      line: 5,
      result: { status: "UNDEFINED" },
    });
    expect(err.message).toBe("UNDEFINED");
  });

  it("uses step location for stack when step is present", () => {
    const err = createError({
      id: "features/test.feature",
      line: 1,
      result: {
        status: "FAILED",
        stepResult: {
          status: TestStepResultStatus.FAILED,
          message: "oops",
          duration: { seconds: 0, nanos: 0 },
        },
        step: {
          location: { line: 10, column: 3 },
          id: "s1",
          keyword: "Given",
          text: "a step",
        },
      },
    });
    expect(err.stack).toContain("features/test.feature:10:3");
  });

  it("falls back to scenario line and column 1 when step is absent", () => {
    const err = createError({
      id: "features/test.feature",
      line: 7,
      result: {
        status: "FAILED",
        stepResult: {
          status: TestStepResultStatus.FAILED,
          message: "oops",
          duration: { seconds: 0, nanos: 0 },
        },
      },
    });
    expect(err.stack).toContain("features/test.feature:7:1");
  });

  it("uses exception message and propagates diff properties when showDiff is true", () => {
    const err = createError({
      id: "features/test.feature",
      line: 5,
      result: {
        status: "FAILED",
        stepResult: {
          status: TestStepResultStatus.FAILED,
          message: "full cucumber output",
          duration: { seconds: 0, nanos: 0 },
          exception: {
            message: "Expected 1 to equal 2",
            type: "AssertionError",
          },
        },
        error: {
          name: "AssertionError",
          message: "Expected 1 to equal 2",
          showDiff: true,
          expected: 2,
          actual: 1,
        },
      },
    });
    expect(err.message).toBe("Expected 1 to equal 2");
    expect((err as Error & { showDiff?: boolean }).showDiff).toBe(true);
    expect((err as Error & { expected?: unknown }).expected).toBe(2);
    expect((err as Error & { actual?: unknown }).actual).toBe(1);
  });
});
