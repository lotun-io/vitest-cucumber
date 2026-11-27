import { storyNameFromExport, toId } from "storybook/internal/csf";
import { expect, test } from "vitest";
import { planOf } from "../../../feature/plan.ts";
import { exportNameOf } from "../featureStories.ts";
import { sameIdErrorsOf } from "../storyIds.ts";

/**
 * The errors of `src/Cart.feature` (its Gherkin `source`): each pickle a story, exported by its
 * name (the plugin's: `exportNameOf`), under the meta id `example-cart-feature-cart`.
 */
const errorsOf = (source: string, names?: string[]) => {
  const { gherkin } = planOf(source, "src/Cart.feature", "en");
  if (!gherkin) {
    throw new Error("no Gherkin");
  }
  return sameIdErrorsOf({
    uri: "src/Cart.feature",
    document: gherkin.document,
    metaId: "example-cart-feature-cart",
    own: "__vitestCucumberFeature",
    stories: gherkin.pickles.map(({ name, location }, index) => {
      const shown = names?.[index] ?? name;
      return {
        export: exportNameOf(shown),
        line: location?.line ?? 0,
        name: shown,
      };
    }),
    ids: { toId, storyNameFromExport },
  });
};

test("stories with ids of their own: no error", () => {
  expect(
    errorsOf(`Feature: Cart
  Scenario: Log in
    Given a step
  Scenario: Log out
    Given a step
  Scenario Outline: Pay with <card>
    Given a step
    Examples:
      | card |
      | Visa |
      | Amex |
`),
  ).toEqual([]);
});

test("names differing in case or punctuation only: one id, an error naming each and the id", () => {
  expect(
    errorsOf(`Feature: Cart
  Scenario: HTTP request
    Given a step
  Scenario: Http request!
    Given a step
`),
  ).toEqual([
    [
      `scenarios would be the same story in Storybook (id "example-cart-feature-cart--http-request"):`,
      `- src/Cart.feature:2 (Scenario: "HTTP request")`,
      `- src/Cart.feature:4 (Scenario: "Http request!")`,
    ].join("\n"),
  ]);
});

test("the same name twice, whatever the keyword: an error per id, each scenario at its line with its keyword", () => {
  expect(
    errorsOf(`Feature: Cart
  Example: Log in
    Given a step
  Scenario: Log in
    Given a step
  Scenario: Log out
    Given a step
  Scenario: Log out
    Given a step
`),
  ).toEqual([
    [
      `scenarios would be the same story in Storybook (id "example-cart-feature-cart--log-in"):`,
      `- src/Cart.feature:2 (Example: "Log in")`,
      `- src/Cart.feature:4 (Scenario: "Log in")`,
    ].join("\n"),
    [
      `scenarios would be the same story in Storybook (id "example-cart-feature-cart--log-out"):`,
      `- src/Cart.feature:6 (Scenario: "Log out")`,
      `- src/Cart.feature:8 (Scenario: "Log out")`,
    ].join("\n"),
  ]);
});

test("an Outline's rows its name doesn't tell apart: an error, with what tells them apart", () => {
  expect(
    errorsOf(`Feature: Cart
  Scenario Outline: Pay
    Given a step
    Examples:
      | card |
      | Visa |
      | Amex |
`),
  ).toEqual([
    [
      `scenarios would be the same story in Storybook (id "example-cart-feature-cart--pay"):`,
      `- src/Cart.feature:6 (Example: "Pay")`,
      `- src/Cart.feature:7 (Example: "Pay")`,
    ].join("\n"),
  ]);
});

test("an Outline's row in another language: its language's `Example` keyword", () => {
  expect(
    errorsOf(`# language: de
Funktionalität: Cart
  Szenariogrundriss: Bezahlen
    Angenommen ein Schritt
    Beispiele:
      | karte |
      | Visa  |
      | Amex  |
`),
  ).toEqual([
    [
      `scenarios would be the same story in Storybook (id "example-cart-feature-cart--bezahlen"):`,
      `- src/Cart.feature:7 (Beispiel: "Bezahlen")`,
      `- src/Cart.feature:8 (Beispiel: "Bezahlen")`,
    ].join("\n"),
  ]);
});

test("a scenario named as the feature's own story: an error naming that story", () => {
  expect(
    errorsOf(`Feature: Cart
  Scenario: Vitest cucumber feature
    Given a step
`),
  ).toEqual([
    [
      `scenarios would be the same story in Storybook (id "example-cart-feature-cart--vitest-cucumber-feature"):`,
      `- src/Cart.feature:1 (the plugin's own story of the feature)`,
      `- src/Cart.feature:2 (Scenario: "Vitest cucumber feature")`,
    ].join("\n"),
  ]);
});

test("unnamed scenarios, by their keywords: one of each, no error; two of one, an error", () => {
  const unnamed = `Feature: Cart
  Scenario:
    Given a step
  Scenario Outline:
    Given a step
    Examples:
      | n |
      | 1 |
`;
  // As the plugin names them (`featureTree`): a scenario its keyword, an unnamed Outline's row `Example`.
  expect(errorsOf(unnamed, ["Scenario", "Example"])).toEqual([]);
  expect(
    errorsOf(`${unnamed}  Scenario:\n    Given a step\n`, [
      "Scenario",
      "Example",
      "Scenario",
    ]),
  ).toEqual([
    [
      `scenarios would be the same story in Storybook (id "example-cart-feature-cart--scenario"):`,
      `- src/Cart.feature:2 (Scenario: "Scenario")`,
      `- src/Cart.feature:9 (Scenario: "Scenario")`,
    ].join("\n"),
  ]);
});
