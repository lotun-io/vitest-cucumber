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
    {
      message: `Scenario: "HTTP request" and Scenario: "Http request!" would be the same story in Storybook (id "example-cart-feature-cart--http-request")`,
      at: ["src/Cart.feature:2", "src/Cart.feature:4"],
    },
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
    {
      message: `Example: "Log in" and Scenario: "Log in" would be the same story in Storybook (id "example-cart-feature-cart--log-in")`,
      at: ["src/Cart.feature:2", "src/Cart.feature:4"],
    },
    {
      message: `Scenario: "Log out" and Scenario: "Log out" would be the same story in Storybook (id "example-cart-feature-cart--log-out")`,
      at: ["src/Cart.feature:6", "src/Cart.feature:8"],
    },
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
    {
      message: `Example: "Pay" and Example: "Pay" would be the same story in Storybook (id "example-cart-feature-cart--pay")`,
      at: ["src/Cart.feature:6", "src/Cart.feature:7"],
    },
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
    {
      message: `Beispiel: "Bezahlen" and Beispiel: "Bezahlen" would be the same story in Storybook (id "example-cart-feature-cart--bezahlen")`,
      at: ["src/Cart.feature:7", "src/Cart.feature:8"],
    },
  ]);
});

test("a scenario named as the feature's own story: an error naming that story", () => {
  expect(
    errorsOf(`Feature: Cart
  Scenario: Vitest cucumber feature
    Given a step
`),
  ).toEqual([
    {
      message: `the plugin's own story of the feature and Scenario: "Vitest cucumber feature" would be the same story in Storybook (id "example-cart-feature-cart--vitest-cucumber-feature")`,
      at: ["src/Cart.feature:1", "src/Cart.feature:2"],
    },
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
    {
      message: `Scenario: "Scenario" and Scenario: "Scenario" would be the same story in Storybook (id "example-cart-feature-cart--scenario")`,
      at: ["src/Cart.feature:2", "src/Cart.feature:9"],
    },
  ]);
});
