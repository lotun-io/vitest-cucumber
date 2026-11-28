import { expect, test } from "vitest";
import {
  hasStorybookPlaceholder,
  parameterNamesOf,
  storybookExpressionOf,
} from "../storybookPlaceholders.ts";

test("parameters as cucumber reads them: an escaped brace is text, an escaped backslash isn't an escape", () => {
  expect(
    parameterNamesOf("the {storybook:story} story with {int} items"),
  ).toEqual(["storybook:story", "int"]);
  expect(parameterNamesOf(String.raw`the \{storybook:story} story`)).toEqual(
    [],
  );
  expect(parameterNamesOf(String.raw`a \\{storybook:story} b`)).toEqual([
    "storybook:story",
  ]);
  expect(parameterNamesOf("{} and {word}")).toEqual(["", "word"]);
});

test("a Storybook placeholder, a parameter: in Storybook's hosts cucumber's {string}, escaped text kept", () => {
  expect(hasStorybookPlaceholder("the {storybook:story} story")).toBe(true);
  expect(
    hasStorybookPlaceholder(String.raw`the \{storybook:story} story`),
  ).toBe(false);
  expect(
    storybookExpressionOf(
      String.raw`the {storybook:story} story, not \{storybook:story}`,
    ),
  ).toBe(String.raw`the {string} story, not \{storybook:story}`);
  expect(
    storybookExpressionOf("the {storybook:storiesFile} file of {int}"),
  ).toBe("the {string} file of {int}");
});
