import { expect, test } from "vitest";
import { parseErrorMessage } from "../parseErrors.ts";

test("the plugin's name and the file once, then each parse error as the parser words it", () => {
  expect(
    parseErrorMessage("features/a.feature", [
      "(1:1): expected: #EOF, #FeatureLine, got 'Featurea: A'",
      "(4:5): expected: #EOF, #StepLine, got 'This is not a step'",
    ]),
  ).toBe(
    [
      "[@lotun/vitest-cucumber] parse error in features/a.feature",
      "(1:1): expected: #EOF, #FeatureLine, got 'Featurea: A'",
      "(4:5): expected: #EOF, #StepLine, got 'This is not a step'",
    ].join("\n"),
  );
});
