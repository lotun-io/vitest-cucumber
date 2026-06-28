import { TestStepResultStatus } from "@cucumber/messages";
import { describe, expect, it } from "vitest";
import { createError } from "../createError.ts";

describe("createError", () => {
  it("uses stepResult message when available", () => {
    const err = createError({
      id: "features/test.feature",
      result: {
        id: "",
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
      result: {
        id: "",
        status: "UNDEFINED",
      },
    });
    expect(err.message).toBe("UNDEFINED");
  });

  it("uses step location for stack when step is present", () => {
    const err = createError({
      id: "features/test.feature",
      result: {
        id: "",
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
      result: {
        id: "",
        lineage: {
          scenario: {
            location: { line: 7 },
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
          } as any,
        },
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

  it("includes feature, scenario, example, and step frames when all present", () => {
    const err = createError({
      id: "features/test.feature",
      result: {
        id: "",
        lineage: {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          feature: { name: "My Feature" } as any,
          scenario: {
            name: "My Scenario",
            location: { line: 5, column: 3 },
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
          } as any,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          example: { location: { line: 12, column: 5 } } as any,
        },
        status: "FAILED",
        stepResult: {
          status: TestStepResultStatus.FAILED,
          message: "oops",
          duration: { seconds: 0, nanos: 0 },
        },
        step: {
          location: { line: 15, column: 7 },
          id: "s1",
          keyword: "Given",
          text: "a step",
        },
      },
    });
    expect(err.stack).toContain("at Scenario (features/test.feature:5:3)");
    expect(err.stack).toContain("at Example (features/test.feature:12:5)");
    expect(err.stack).toContain("at Step (features/test.feature:15:7)");
  });

  it("falls back to FAILED when both stepResult message and status are absent", () => {
    const err = createError({
      id: "features/test.feature",
      result: {
        id: "",
      },
    });
    expect(err.message).toBe("FAILED");
  });

  it("propagates diff properties when showDiff is absent but actual and expected are present", () => {
    const err = createError({
      id: "features/test.feature",
      result: {
        id: "",
        status: "FAILED",
        stepResult: {
          status: TestStepResultStatus.FAILED,
          message: "full cucumber output",
          duration: { seconds: 0, nanos: 0 },
        },
        error: {
          message: "bare message",
          expected: 2,
          actual: 1,
        },
      },
    });
    expect(err.message).toBe("bare message");
    expect((err as Error & { expected?: unknown }).expected).toBe(2);
    expect((err as Error & { actual?: unknown }).actual).toBe(1);
  });

  it("falls back to column 1 when example and step location column are absent", () => {
    const err = createError({
      id: "features/test.feature",
      result: {
        id: "",
        lineage: {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          scenario: { location: { line: 5, column: 3 } } as any,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          example: { location: { line: 12 } } as any,
        },
        status: "FAILED",
        step: {
          location: { line: 15 },
          id: "s1",
          keyword: "Given",
          text: "a step",
        },
      },
    });
    expect(err.stack).toContain("at Example (features/test.feature:12:1)");
    expect(err.stack).toContain("at Step (features/test.feature:15:1)");
  });

  it("uses exception message and propagates diff properties when showDiff is true", () => {
    const err = createError({
      id: "features/test.feature",
      result: {
        id: "",
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
