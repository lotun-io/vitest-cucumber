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
  it("extracts the feature name", async () => {
    const { featureName } = await parseFeature(
      "Feature: My Awesome Feature\n  Scenario: s\n    Given x\n",
    );
    expect(featureName).toBe("My Awesome Feature");
  });

  it('falls back to "Feature" when name is empty', async () => {
    const { featureName } = await parseFeature(
      "Feature:\n  Scenario: s\n    Given x\n",
    );
    expect(featureName).toBe("Feature");
  });
});

// ---------------------------------------------------------------------------
// Regular scenarios
// ---------------------------------------------------------------------------

describe("parseFeature – regular scenarios", () => {
  it("returns one entry per scenario with correct name", async () => {
    const { pickles } = await parseFeature(
      feature(scenario("login") + scenario("logout")),
    );
    expect(pickles.map((s) => s.name)).toEqual(["login", "logout"]);
  });

  it("sets ruleName to null for top-level scenarios", async () => {
    const { pickles } = await parseFeature(feature(scenario("s")));
    expect(pickles[0].lineage?.rule?.location.line).toBeUndefined();
  });

  it("captures the scenario line number", async () => {
    const content = "Feature: F\n  Scenario: s\n    Given x\n";
    const { pickles } = await parseFeature(content);
    // "  Scenario: s" is on line 2
    expect(pickles[0].lineage?.scenario?.location.line).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// Rules
// ---------------------------------------------------------------------------

describe("parseFeature – rules", () => {
  it("sets ruleName for scenarios inside a Rule", async () => {
    const content = feature(rule("My Rule", scenario("inside rule")));
    const { pickles } = await parseFeature(content);
    expect(pickles[0].lineage?.rule?.name).toBe("My Rule");
  });

  it("handles mixed top-level and rule scenarios", async () => {
    const content = feature(
      scenario("top") + rule("R", scenario("under rule")),
    );
    const { pickles } = await parseFeature(content);
    expect(pickles[0]).toMatchObject({
      name: "top",
    });
    expect(pickles[0].lineage?.rule?.name).toBeUndefined();
    expect(pickles[1]).toMatchObject({
      name: "under rule",
      lineage: { rule: { name: "R" } },
    });
  });
});

// ---------------------------------------------------------------------------
// Scenario Outlines
// ---------------------------------------------------------------------------

describe("parseFeature – scenario outlines", () => {
  it("expands outline rows into individual scenarios", async () => {
    const content = feature(
      outline("login with <role>", "role", ["admin", "user"]),
    );
    const { pickles } = await parseFeature(content);
    expect(pickles.map((s) => s.name)).toEqual([
      "login with admin",
      "login with user",
    ]);
  });

  it("uses the example row line, not the outline heading line", async () => {
    const content = [
      "Feature: F",
      "  Scenario Outline: do <x>", // line 2 – outline heading
      "    Given step <x>",
      "    Examples:",
      "      | x   |",
      "      | foo |", // line 6 – first example row
      "      | bar |", // line 7 – second example row
    ].join("\n");
    const { pickles } = await parseFeature(content);
    expect(pickles[0].lineage?.example?.location.line).toBe(6);
    expect(pickles[1].lineage?.example?.location.line).toBe(7);
  });

  it("sets ruleName correctly for outlines inside a rule", async () => {
    const content = feature(rule("R", outline("o <v>", "v", ["x"])));
    const { pickles } = await parseFeature(content);
    expect(pickles[0].lineage?.rule?.name).toBe("R");
  });
});

// ---------------------------------------------------------------------------
// uri is forwarded (smoke)
// ---------------------------------------------------------------------------

describe("parseFeature – uri", async () => {
  it("does not throw when uri is provided", async () => {
    await expect(
      parseFeature(feature(scenario("s")), "/path/to/my.feature"),
    ).resolves.not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// Parse errors
// ---------------------------------------------------------------------------

describe("parseFeature – parse errors", () => {
  it("throws on parse error with all errors listed", async () => {
    const content = "not valid gherkin\n  Scenario: oops\n    Given x\n";
    await expect(parseFeature(content, "bad.feature")).rejects.toThrow(
      /Parse failure/,
    );
  });

  it("includes the source uri and location in the error message", async () => {
    const content = "not valid gherkin\n";
    await expect(parseFeature(content, "my/file.feature")).rejects.toThrow(
      'Parse error in "my/file.feature"',
    );
  });

  it("lists all parse errors with line and column numbers", async () => {
    const content = [
      "FeatureParse: Error",
      "",
      "    ScenarioParse: Error",
      "        GivenParse Error",
      "        WhenParse Error",
      "        ThenParse Error",
    ].join("\n");
    const uri = "parse-error.feature";
    await expect(parseFeature(content, uri)).rejects.toThrow(
      [
        "Parse failure",
        `Parse error in "${uri}" (1:1): expected: #EOF, #Language, #TagLine, #FeatureLine, #Comment, #Empty, got 'FeatureParse: Error'`,
        `Parse error in "${uri}" (3:5): expected: #EOF, #Language, #TagLine, #FeatureLine, #Comment, #Empty, got 'ScenarioParse: Error'`,
        `Parse error in "${uri}" (4:9): expected: #EOF, #Language, #TagLine, #FeatureLine, #Comment, #Empty, got 'GivenParse Error'`,
        `Parse error in "${uri}" (5:9): expected: #EOF, #Language, #TagLine, #FeatureLine, #Comment, #Empty, got 'WhenParse Error'`,
        `Parse error in "${uri}" (6:9): expected: #EOF, #Language, #TagLine, #FeatureLine, #Comment, #Empty, got 'ThenParse Error'`,
      ].join("\n"),
    );
  });
});
