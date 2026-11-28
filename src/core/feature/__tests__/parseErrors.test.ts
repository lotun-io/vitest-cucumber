import { expect, test } from "vitest";
import { parseErrorOf } from "../parseErrors.ts";
import { planOf } from "../plan.ts";

test("feature file can't be parsed: each parse error as the parser words it, its place under it", () => {
  const content = [
    "Featurea: A",
    "",
    "  Scenario: B",
    "    This is not a step",
  ].join("\n");
  const { parseErrors } = planOf(content, "features/a.feature", "en");
  expect(parseErrorOf("features/a.feature", parseErrors).message).toBe(
    [
      "[@lotun/vitest-cucumber] feature file can't be parsed",
      "  - expected: #EOF, #Language, #TagLine, #FeatureLine, #Comment, #Empty, got 'Featurea: A'",
      "    features/a.feature:1:1",
      "  - expected: #EOF, #Language, #TagLine, #FeatureLine, #Comment, #Empty, got 'Scenario: B'",
      "    features/a.feature:3:3",
      "  - expected: #EOF, #Language, #TagLine, #FeatureLine, #Comment, #Empty, got 'This is not a step'",
      "    features/a.feature:4:5",
    ].join("\n"),
  );
});
