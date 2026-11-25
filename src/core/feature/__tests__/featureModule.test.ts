import { DecodedMap, getOriginalPosition } from "@vitest/utils/source-map";
import { expect, test } from "vitest";
import { defaultRunOptions } from "../../../utils/runOptions.ts";
import { featureModule } from "../featureModule.ts";
import { planOf } from "../plan.ts";
import type { VitestPlan } from "../plans.ts";

const file = "/p/features/cart.feature";

/** A feature file's plan, as `plans.ts` makes it from its text. */
const planFor = (content: string): VitestPlan => {
  const { featureTree, gherkin } = planOf(
    content,
    "features/cart.feature",
    "en",
  );
  if (!gherkin) {
    throw new Error("the feature doesn't parse");
  }
  return {
    uri: "features/cart.feature",
    content,
    tags: [],
    featureTree,
    gherkin,
    options: defaultRunOptions,
    supportFiles: ["/p/features/steps.ts"],
  };
};

const cart = `# A comment
@cart
Feature: Cart

  Background:
    Given an empty cart

  @smoke
  Scenario: Adding an item
    When I add "apples"

  Rule: Discounts

    Scenario Outline: A coupon
      When I add "<item>"

      Examples:
        | item   |
        | apples |
        | pears  |

  Scenario: A note
    When I write:
      """
      hello
      """
`;

test("each suite and test is a call on its Gherkin line, every other line empty; the first line imports the runtime and sets it up", () => {
  const { code } = featureModule({
    platform: "/platform.ts",
    cwd: "/p",
    file,
    plan: planFor(cart),
  });
  const lines = code.split("\n");
  // A line per line of the feature file: every call stays on its Gherkin line.
  expect(lines).toHaveLength(cart.split("\n").length);
  expect(lines[0]).toMatch(
    /^import \{ feature \} from ".*runtime\.ts"; import \{ platform \} from "\/platform\.ts"; const \{ describe, scenarioTest \} = feature\(\{ plan: \{.*\}, platform, importSupport: async \(\) => \{ +await import\("\/p\/features\/steps\.ts"\); \} \}\); $/,
  );
  expect(
    Object.fromEntries(
      lines
        .map((line, index) => [index + 1, line] as const)
        .filter(([number, line]) => number > 1 && line !== ""),
    ),
  ).toEqual({
    3: 'describe("Cart", () => {',
    9: 'scenarioTest("Adding an item", { tags: ["@cart","@smoke"] }, { line: 9 });',
    12: 'describe("Discounts", () => {',
    14: 'describe("A coupon", () => {',
    19: 'scenarioTest("A coupon", { tags: ["@cart"] }, { line: 19 });',
    20: 'scenarioTest("A coupon", { tags: ["@cart"] }, { line: 20 }); });',
    22: 'scenarioTest("A note", { tags: ["@cart"] }, { line: 22 }); }); });',
  });
});

test("its map: each call at its Gherkin line and column (Vitest's static collection reads it); a step's line nothing (an error's frame there stays as it is)", () => {
  const { map } = featureModule({
    platform: "/platform.ts",
    cwd: "/p",
    file,
    plan: planFor(cart),
  });
  if (!map) {
    throw new Error("no map");
  }
  const decoded = new DecodedMap(JSON.parse(map.toString()), file);
  /** The original position of the generated line `line`'s first character (its call's). */
  const originalOf = (line: number) =>
    getOriginalPosition(decoded, { line, column: 0 });
  expect(originalOf(9)).toMatchObject({ line: 9, column: 2 });
  expect(originalOf(19)).toMatchObject({ line: 19, column: 8 });
  // A step's line (empty) has no mapping.
  expect(getOriginalPosition(decoded, { line: 10, column: 4 })).toBeNull();
});

test("an unnamed feature: no suite, its scenarios the file's", () => {
  const { code } = featureModule({
    platform: "/platform.ts",
    cwd: "/p",
    file,
    plan: planFor("Feature:\n  Scenario: a\n    Given a step\n"),
  });
  expect(code.split("\n").slice(1)).toEqual([
    'scenarioTest("a", { tags: [] }, { line: 2 });',
    "",
    "",
  ]);
});

test("a feature file that can't be used: a suite that throws its error, no map", () => {
  const { code, map } = featureModule({
    platform: "/platform.ts",
    cwd: "/p",
    file,
    plan: { error: new Error("broken") },
  });
  expect(code).toContain("broken");
  expect(map).toBeUndefined();
});
