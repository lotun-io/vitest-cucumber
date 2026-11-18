// Cucumber's theme for its summary (a copy of `@cucumber/pretty-formatter` 4.1.0's `CUCUMBER_THEME`,
// `theme.ts`, the parts the summary uses: a status's color, a location's, a step's keyword and
// arguments, the bullet), and the formatter's constants (`utils.ts`). Page-safe.
import { TestStepResultStatus } from "@cucumber/messages";
import type { Style } from "./style.ts";

export interface Theme {
  location: Style;
  status: { all: Record<TestStepResultStatus, Style> };
  step: { keyword: Style; argument: Style };
  symbol: { bullet: string };
}

export const CUCUMBER_THEME: Theme = {
  location: "blackBright",
  status: {
    all: {
      [TestStepResultStatus.AMBIGUOUS]: "magenta",
      [TestStepResultStatus.FAILED]: "red",
      [TestStepResultStatus.PASSED]: "green",
      [TestStepResultStatus.PENDING]: "cyan",
      [TestStepResultStatus.SKIPPED]: "yellow",
      [TestStepResultStatus.UNDEFINED]: "blue",
      [TestStepResultStatus.UNKNOWN]: "gray",
    },
  },
  step: { argument: "bold", keyword: "bold" },
  symbol: { bullet: "•" },
};

export const GHERKIN_INDENT_LENGTH = 2;
export const STEP_ARGUMENT_INDENT_LENGTH = 2;
export const ERROR_INDENT_LENGTH = 4;

/** The statuses, best to worst. */
export const ORDERED_STATUSES = [
  TestStepResultStatus.UNKNOWN,
  TestStepResultStatus.PASSED,
  TestStepResultStatus.SKIPPED,
  TestStepResultStatus.PENDING,
  TestStepResultStatus.UNDEFINED,
  TestStepResultStatus.AMBIGUOUS,
  TestStepResultStatus.FAILED,
];
