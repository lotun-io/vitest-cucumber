import { describe, it, expect } from "vitest";
import { parseFeature } from "../parser.ts";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const feature = (body: string) => `Feature: Test Feature\n${body}`;

const scenario = (name: string, steps = "Given a step") =>
  `  Scenario: ${name}\n    ${steps}\n`;

const outline = (
  name: string,
  param: string,
  values: string[],
  steps = `Given a step with <${param}>`,
) =>
  `${[
    `  Scenario Outline: ${name}`,
    `    ${steps}`,
    `    Examples:`,
    `      | ${param} |`,
    ...values.map((v) => `      | ${v}     |`),
  ].join("\n")}\n`;

const rule = (name: string, body: string) => `  Rule: ${name}\n${body}`;

// ---------------------------------------------------------------------------
// Feature name
// ---------------------------------------------------------------------------

describe("parseFeature – feature name", () => {
  it("extracts the feature name", () => {
    const { featureName } = parseFeature(
      "Feature: My Awesome Feature\n  Scenario: s\n    Given x\n",
    );
    expect(featureName).toBe("My Awesome Feature");
  });

  it('falls back to "Feature" when name is empty', () => {
    const { featureName } = parseFeature(
      "Feature:\n  Scenario: s\n    Given x\n",
    );
    expect(featureName).toBe("Feature");
  });
});

// ---------------------------------------------------------------------------
// Regular scenarios
// ---------------------------------------------------------------------------

describe("parseFeature – regular scenarios", () => {
  it("returns one entry per scenario with correct name", () => {
    const { scenarios } = parseFeature(
      feature(scenario("login") + scenario("logout")),
    );
    expect(scenarios.map((s) => s.name)).toEqual(["login", "logout"]);
  });

  it("sets ruleName to null for top-level scenarios", () => {
    const { scenarios } = parseFeature(feature(scenario("s")));
    expect(scenarios[0].ruleName).toBeNull();
  });

  it("captures the scenario line number", () => {
    const content = "Feature: F\n  Scenario: s\n    Given x\n";
    const { scenarios } = parseFeature(content);
    // "  Scenario: s" is on line 2
    expect(scenarios[0].line).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// Rules
// ---------------------------------------------------------------------------

describe("parseFeature – rules", () => {
  it("sets ruleName for scenarios inside a Rule", () => {
    const content = feature(rule("My Rule", scenario("inside rule")));
    const { scenarios } = parseFeature(content);
    expect(scenarios[0].ruleName).toBe("My Rule");
  });

  it("handles mixed top-level and rule scenarios", () => {
    const content = feature(
      scenario("top") + rule("R", scenario("under rule")),
    );
    const { scenarios } = parseFeature(content);
    expect(scenarios[0]).toMatchObject({ name: "top", ruleName: null });
    expect(scenarios[1]).toMatchObject({ name: "under rule", ruleName: "R" });
  });
});

// ---------------------------------------------------------------------------
// Scenario Outlines
// ---------------------------------------------------------------------------

describe("parseFeature – scenario outlines", () => {
  it("expands outline rows into individual scenarios", () => {
    const content = feature(
      outline("login with <role>", "role", ["admin", "user"]),
    );
    const { scenarios } = parseFeature(content);
    expect(scenarios.map((s) => s.name)).toEqual([
      "login with admin",
      "login with user",
    ]);
  });

  it("uses the example row line, not the outline heading line", () => {
    const content = [
      "Feature: F",
      "  Scenario Outline: do <x>", // line 2 – outline heading
      "    Given step <x>",
      "    Examples:",
      "      | x   |",
      "      | foo |", // line 6 – first example row
      "      | bar |", // line 7 – second example row
    ].join("\n");
    const { scenarios } = parseFeature(content);
    expect(scenarios[0].line).toBe(6);
    expect(scenarios[1].line).toBe(7);
  });

  it("sets ruleName correctly for outlines inside a rule", () => {
    const content = feature(rule("R", outline("o <v>", "v", ["x"])));
    const { scenarios } = parseFeature(content);
    expect(scenarios[0].ruleName).toBe("R");
  });
});

// ---------------------------------------------------------------------------
// Duplicate name deduplication
// ---------------------------------------------------------------------------

describe("parseFeature – duplicate name deduplication", () => {
  it("appends (2), (3) for duplicate scenario names", () => {
    const content = feature(
      scenario("same") + scenario("same") + scenario("same"),
    );
    const { scenarios } = parseFeature(content);
    expect(scenarios.map((s) => s.name)).toEqual([
      "same",
      "same (2)",
      "same (3)",
    ]);
  });

  it("does not alter unique names", () => {
    const content = feature(scenario("a") + scenario("b") + scenario("c"));
    const { scenarios } = parseFeature(content);
    expect(scenarios.map((s) => s.name)).toEqual(["a", "b", "c"]);
  });

  it("deduplicates across outline rows with the same expanded name", () => {
    // Two outlines both produce a pickle named "test foo"
    const content = feature(
      outline("test <x>", "x", ["foo"]) + outline("test <x>", "x", ["foo"]),
    );
    const { scenarios } = parseFeature(content);
    expect(scenarios.map((s) => s.name)).toEqual(["test foo", "test foo (2)"]);
  });
});

// ---------------------------------------------------------------------------
// uri is forwarded (smoke)
// ---------------------------------------------------------------------------

describe("parseFeature – uri", () => {
  it("does not throw when uri is provided", () => {
    expect(() =>
      parseFeature(feature(scenario("s")), "/path/to/my.feature"),
    ).not.toThrow();
  });
});
