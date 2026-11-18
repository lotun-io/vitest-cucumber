// A scenario's steps and the snippets, composed as `@cucumber/pretty-formatter` 4.1.0 composes them (a
// copy of its `composeScenarioSummary.ts`, its steps' part, and `composeSnippets.ts`), from our query
// (`../../runner/query.ts`) instead of `@cucumber/query`. Left out: the first line (the scenario's name and
// location, which the Vitest test shows) and attachments (the test's annotations). Page-safe.
import type { Suggestion } from "@cucumber/messages";
import type { Finished, Query } from "../../../types/query.ts";
import {
  extractReportableMessage,
  formatAmbiguousStep,
  formatError,
  formatHookTitle,
  formatPickleStepArgument,
  formatSourceReference,
  formatStepTitle,
  indent,
  join,
} from "./formatting.ts";
import type { Styler } from "./style.ts";
import {
  ERROR_INDENT_LENGTH,
  GHERKIN_INDENT_LENGTH,
  STEP_ARGUMENT_INDENT_LENGTH,
  type Theme,
} from "./theme.ts";

/** The first step that didn't pass, and each later one that didn't pass and wasn't skipped. */
const pertinentSteps = (finished: readonly Finished[]) => {
  const result: Finished[] = [];
  let foundFirstNonPassed = false;
  for (const each of finished) {
    const { status } = each.result;
    if (foundFirstNonPassed) {
      if (status !== "PASSED" && status !== "SKIPPED") {
        result.push(each);
      }
    } else if (status !== "PASSED") {
      result.push(each);
      foundFirstNonPassed = true;
    }
  }
  return result;
};

/** A step's lines: its title and definition's location, its argument, an ambiguity, its message. */
const formatStep = (
  { result, testStepId }: Finished,
  query: Query,
  theme: Theme,
  style: Styler,
) => {
  const lines: string[] = [];
  const { status } = result;
  const testStep =
    testStepId === undefined ? undefined : query.testStep(testStepId);
  if (testStep?.pickleStepId) {
    const pickleStep = query.pickleStepOf(testStepId);
    const step = pickleStep && query.stepOf(pickleStep);
    if (!pickleStep || !step) {
      throw new Error("Step must exist for PickleStep");
    }
    const ids = testStep.stepDefinitionIds ?? [];
    const stepDefinition =
      ids.length === 1 ? query.stepDefinition(ids[0] ?? "") : undefined;
    lines.push(
      indent(
        join(
          formatStepTitle(
            testStep,
            pickleStep,
            step.keyword,
            status,
            theme,
            style,
          ),
          stepDefinition &&
            formatSourceReference(stepDefinition.sourceReference, theme, style),
        ),
        GHERKIN_INDENT_LENGTH,
      ),
    );
    if (pickleStep.argument) {
      lines.push(
        indent(
          formatPickleStepArgument(pickleStep.argument, style),
          GHERKIN_INDENT_LENGTH + STEP_ARGUMENT_INDENT_LENGTH,
        ),
      );
    }
    if (status === "AMBIGUOUS") {
      const stepDefinitions = ids.flatMap(
        (id) => query.stepDefinition(id) ?? [],
      );
      lines.push(
        indent(
          formatAmbiguousStep(stepDefinitions, theme, style),
          GHERKIN_INDENT_LENGTH + ERROR_INDENT_LENGTH,
        ),
      );
    }
  } else if (testStep?.hookId) {
    const hook = query.hook(testStep.hookId);
    lines.push(
      indent(
        join(
          formatHookTitle(hook, status, theme, style),
          hook && formatSourceReference(hook.sourceReference, theme, style),
        ),
        GHERKIN_INDENT_LENGTH,
      ),
    );
  }
  const message = extractReportableMessage(result);
  if (message) {
    lines.push(
      indent(
        formatError(message, status, theme, style),
        GHERKIN_INDENT_LENGTH + ERROR_INDENT_LENGTH,
      ),
    );
  }
  return lines;
};

/** A scenario's pertinent steps (of `finished`, its test steps' results), as its summary lists them. */
export const composeScenarioSteps = (
  finished: readonly Finished[],
  query: Query,
  theme: Theme,
  style: Styler,
) =>
  pertinentSteps(finished)
    .flatMap((each) => formatStep(each, query, theme, style))
    .join("\n");

/** The snippets of `suggestions`, each code once, after cucumber's heading. */
export const composeSnippets = (suggestions: readonly Suggestion[]) => {
  const seen = new Set<string>();
  const unique = suggestions
    .flatMap(({ snippets }) => snippets)
    .filter(({ code }) => {
      if (seen.has(code)) {
        return false;
      }
      seen.add(code);
      return true;
    });
  return [
    "",
    "You can implement missing steps with the snippets below:",
    "",
    ...unique.flatMap(({ code }) => [code, ""]),
  ].join("\n");
};
