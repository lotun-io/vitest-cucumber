import {
  CucumberExpressionGenerator,
  ParameterType,
  ParameterTypeRegistry,
} from "@cucumber/cucumber-expressions";
import { type PickleStep, PickleStepType } from "@cucumber/messages";
import { expect, test } from "vitest";
import { makeSuggestion } from "../suggestion.ts";

/** The snippets for a step of `text`, with the parameter types `defined` (by name: a pattern). */
const snippetsOf = (
  step: Partial<PickleStep> & { text: string },
  defined: Record<string, RegExp> = {},
) => {
  const registry = new ParameterTypeRegistry();
  for (const [name, pattern] of Object.entries(defined)) {
    registry.defineParameterType(
      new ParameterType(name, pattern, null, (value: string) => value, true),
    );
  }
  const { snippets } = makeSuggestion({
    newId: () => "id",
    generator: new CucumberExpressionGenerator(() => registry.parameterTypes),
    pickleStep: { id: "step", astNodeIds: [], ...step },
  });
  return snippets.map(({ code }) => code);
};

test("a snippet: the step's function by its keyword's type, its expression, an arrow function with its parameters, cucumber's body", () => {
  expect(
    snippetsOf({ text: 'I pay with "card"', type: PickleStepType.ACTION }),
  ).toEqual([
    [
      "When('I pay with {string}', (string) => {",
      "  // Write code here that turns the phrase above into concrete actions",
      "  return 'pending';",
      "});",
    ].join("\n"),
  ]);
  expect(snippetsOf({ text: "an empty cart" })[0]).toMatch(
    /^Given\('an empty cart', \(\) => \{\n/,
  );
  expect(
    snippetsOf({ text: "it's paid", type: PickleStepType.OUTCOME })[0],
  ).toMatch(/^Then\('it\\'s paid', \(\) => \{\n/);
});

test("a step's data table or doc string: its last parameter", () => {
  expect(
    snippetsOf({
      text: "I add 2 items",
      argument: { dataTable: { rows: [] } },
    })[0],
  ).toMatch(/^Given\('I add \{int\} items', \(int, dataTable\) => \{\n/);
});

test("a first parameter named `world` (a parameter type's name) is written `world1`: an arrow function's `world` is the World", () => {
  expect(
    snippetsOf({ text: "on mars with mars" }, { world: /earth|mars/ })[0],
  ).toMatch(
    /^Given\('on \{world\} with \{world\}', \(world1, world2\) => \{\n/,
  );
});
