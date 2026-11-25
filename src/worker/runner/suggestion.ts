// An undefined step's suggestion, as cucumber's runtime makes it (a port of 13.3.0's
// `lib/runtime/make_suggestion.ts`, with its `StepDefinitionSnippetBuilder` and
// `JavaScriptSnippetSyntax`, `lib/formatter/step_definition_snippet_builder/`): a snippet for each
// expression the support code's parameter types allow (`@cucumber/core`'s expression generator),
// named by the step's keyword type, in cucumber's default interface (synchronous: the plugin has no
// snippet options). The plugin's own in one thing (the user's call, 2026-11-25): its function is an
// arrow function, as the docs write a step, where cucumber's is a `function` (the compatibility
// kit compares cucumber's as one: `compatibility/utils/kit.ts`). Page-safe.
import type {
  CucumberExpressionGenerator,
  GeneratedExpression,
} from "@cucumber/cucumber-expressions";
import type { PickleStep, Suggestion } from "@cucumber/messages";

const comment =
  "Write code here that turns the phrase above into concrete actions";

/** The step's function name, by its keyword's type (cucumber's `KeywordType`). */
const functionNameOf = ({ type }: PickleStep) =>
  type === "Action" ? "When" : type === "Outcome" ? "Then" : "Given";

/** Doubles backslashes and escapes single quotes: the expression in a JavaScript string. */
const escaped = ({ source }: GeneratedExpression) =>
  source.replace(/\\/g, "\\\\").replace(/'/g, "\\'");

/**
 * A snippet's code (cucumber's `JavaScriptSnippetSyntax.build`, synchronous), its function an arrow
 * function. A first parameter named `world` (a parameter type of that name) is written `world1`:
 * an arrow function whose first parameter is `world` gets the World there (`./thisFirst.ts`).
 */
const snippetOf = (
  functionName: string,
  generatedExpression: GeneratedExpression,
  stepParameterNames: readonly string[],
) => {
  const parameterNames = [
    ...generatedExpression.parameterNames,
    ...stepParameterNames,
  ].map((name, index) => (index === 0 && name === "world" ? "world1" : name));
  return (
    `${functionName}('${escaped(generatedExpression)}', (${parameterNames.join(", ")}) => {\n` +
    `  // ${comment}\n  return 'pending';\n});`
  );
};

export const makeSuggestion = ({
  newId,
  generator,
  pickleStep,
}: {
  newId: () => string;
  generator: CucumberExpressionGenerator;
  pickleStep: PickleStep;
}): Suggestion => {
  const functionName = functionNameOf(pickleStep);
  const stepParameterNames = [
    ...(pickleStep.argument?.dataTable ? ["dataTable"] : []),
    ...(pickleStep.argument?.docString ? ["docString"] : []),
  ];
  return {
    id: newId(),
    pickleStepId: pickleStep.id,
    snippets: generator
      .generateExpressions(pickleStep.text)
      .map((generated) => ({
        code: snippetOf(functionName, generated, stepParameterNames),
        language: "javascript",
      })),
  };
};
