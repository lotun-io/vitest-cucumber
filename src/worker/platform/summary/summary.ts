// Cucumber's summary of a scenario that didn't pass, as its `summary` formatter prints it: the steps
// under each status's heading (`Undefined steps:`), the missing parameter types it could use, and
// snippets for the undefined steps. Composed from the run's messages (our query) with our copy of
// `@cucumber/pretty-formatter`'s pieces (`./compose.ts`, `./formatting.ts`), in the colors Vitest's
// output uses (`colors`), its paths with `/`. Both modes compose it where the run ran: node mode's
// worker, browser mode's page. Page-safe.
import { TestStepResultStatus } from "@cucumber/messages";
import type { Query } from "../../../types/query.ts";
import { isUnexplained } from "../../runner/query.ts";
import { composeScenarioSteps, composeSnippets } from "./compose.ts";
import {
  formatForStatus,
  formatStatusName,
  formatUndefinedParameterType,
} from "./formatting.ts";
import { usedMissingTypes } from "./missingParameterTypes.ts";
import { stylerOf } from "./style.ts";
import {
  CUCUMBER_THEME,
  GHERKIN_INDENT_LENGTH,
  ORDERED_STATUSES,
} from "./theme.ts";

/** The statuses the summary lists, each in its own section, in cucumber's order. */
const listed = ORDERED_STATUSES.filter(isUnexplained);

/**
 * The summary of a scenario's run (its `query`), or `undefined` if nothing needs one. It lists the
 * undefined, pending and ambiguous steps, each status under its own heading; failed steps aren't
 * listed, since each is its own Vitest error. With an undefined step it adds the run's missing
 * parameter types its undefined steps could use, and the snippets come last.
 */
export const summaryOf = ({
  query,
  colors,
}: {
  query: Query;
  colors: boolean;
}) => {
  const theme = CUCUMBER_THEME;
  const style = stylerOf({ colors });
  const finished = query.testStepResults();
  const statuses = new Set(finished.map(({ result }) => result.status));
  // Each status's steps, as cucumber lists a scenario's (under its name and location, which the
  // Vitest test already shows).
  const sections = listed
    .filter((status) => statuses.has(status))
    .map((status) =>
      [
        formatForStatus(
          status,
          `${formatStatusName(status)} steps:`,
          theme,
          style,
        ),
        composeScenarioSteps(
          finished.filter(({ result }) => result.status === status),
          query,
          theme,
          style,
        ),
      ].join("\n"),
    );
  if (sections.length === 0) {
    return undefined;
  }
  // Like the formatter's `printUnknownParameterTypes`, which lists all of them once per run: here
  // the ones the scenario's undefined steps could use.
  const missing = statuses.has(TestStepResultStatus.UNDEFINED)
    ? usedMissingTypes(query, query.undefinedParameterTypes())
    : [];
  const suggestions = query.suggestions();
  return [
    sections.join("\n\n"),
    ...(missing.length > 0
      ? [
          [
            "",
            formatForStatus(
              TestStepResultStatus.UNDEFINED,
              "These parameters are missing a parameter type definition:",
              theme,
              style,
            ),
            // Not numbered, as the steps above (cucumber numbers its run-wide list).
            ...missing.map(
              (each) =>
                `${" ".repeat(GHERKIN_INDENT_LENGTH)}${formatUndefinedParameterType(each)}`,
            ),
          ].join("\n"),
        ]
      : []),
    ...(suggestions.length > 0 ? [composeSnippets(suggestions)] : []),
  ].join("\n");
};
