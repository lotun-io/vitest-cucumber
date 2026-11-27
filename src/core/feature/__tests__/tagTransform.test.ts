import { expect, test } from "vitest";
import { tagsOf } from "../featureTags.ts";
import { planOf } from "../plan.ts";
import { tagOf } from "../tagTransform.ts";

test("`@tag(<name>)` is the tag `<name>`, whatever it is; any other tag as it's written", () => {
  expect(tagOf("@tag(dev)")).toBe("dev");
  expect(tagOf("@tag(!dev)")).toBe("!dev");
  expect(tagOf("@tag(a(b))")).toBe("a(b)");
  expect(tagOf("@smoke")).toBe("@smoke");
  expect(tagOf("@tag()")).toBe("@tag()");
  expect(tagOf("@tags(dev)")).toBe("@tags(dev)");
  expect(tagOf("@tag(dev)x")).toBe("@tag(dev)x");
});

const feature = [
  "@tag(cart)",
  "Feature: Cart",
  "  @smoke @tag(slow)",
  "  Scenario: Adding an item",
  "    Given a step",
  "  Scenario Outline: A coupon for <item>",
  "    Given a step",
  "    @tag(!dev)",
  "    Examples:",
  "      | item   |",
  "      | apples |",
].join("\n");

test("a plan's pickles have them (cucumber's hooks and messages, the tests' Vitest tags), its document the tags as written", () => {
  const { gherkin, featureTree } = planOf(feature, "cart.feature", "en");
  expect(
    gherkin?.pickles.map(({ tags }) => tags.map(({ name }) => name)),
  ).toEqual([
    ["cart", "@smoke", "slow"],
    ["cart", "!dev"],
  ]);
  expect(gherkin?.document.feature?.tags.map(({ name }) => name)).toEqual([
    "@tag(cart)",
  ]);
  const tests = featureTree.children.flatMap((child) =>
    "children" in child ? child.children : [child],
  );
  expect(tests.map((each) => ("tags" in each ? each.tags : []))).toEqual([
    ["cart", "@smoke", "slow"],
    ["cart", "!dev"],
  ]);
});

test("a feature file's declared tags: theirs, as its tests have them", () => {
  expect(tagsOf(feature, "cart.feature", "en")).toEqual([
    "cart",
    "@smoke",
    "slow",
    "!dev",
  ]);
});
