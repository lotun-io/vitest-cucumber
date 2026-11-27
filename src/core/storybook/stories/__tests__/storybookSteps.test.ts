import { describe, expect, test } from "vitest";
import { scanSupportCode, storybookStepsOf } from "../storybookSteps.ts";

/** A support file with the Storybook steps, as the docs show them. */
const stories = [
  `import { Given } from "@cucumber/cucumber";`,
  `Given("the {storybook:story} story", (_story: string) => {});`,
  `Given('the unmounted {storybook:storyUnmounted} story', (_story: string) => {});`,
  "Given(`the stories of {storybook:storiesFile}`, (_file: string) => {});",
  `Given("I click {string}", () => {});`,
].join("\n");

const stepsOf = (...files: [code: string, file: string][]) =>
  storybookStepsOf(files.map(([code, file]) => scanSupportCode(code, file)));

describe("Storybook steps, from the support code", () => {
  test("a Storybook step: its story; unmounted with its own type; a stories file step: its path", () => {
    const { match, errors } = stepsOf([stories, "/p/steps/stories.ts"]);
    expect(errors).toEqual([]);
    expect(match('the "Primary" story')).toEqual([
      { at: "/p/steps/stories.ts:2", exportName: "Primary", unmounted: false },
    ]);
    expect(match('the unmounted "Primary" story')).toEqual([
      { at: "/p/steps/stories.ts:3", exportName: "Primary", unmounted: true },
    ]);
    expect(match('the stories of "src/Button.stories.ts"')).toEqual([
      {
        at: "/p/steps/stories.ts:4",
        storiesFile: "src/Button.stories.ts",
        unmounted: false,
      },
    ]);
  });

  test("any other step: none", () => {
    const { match } = stepsOf([stories, "/p/steps/stories.ts"]);
    expect(match('I click "OK"')).toEqual([]);
    expect(match("the Primary button story")).toEqual([]);
  });

  test("any wording, in any language, with cucumber's built-in parameter types", () => {
    const code = [
      `Given("die nicht gemountete {storybook:storyUnmounted} Story", (story) => {});`,
      `When("the {storybook:story} story, at {int} px", (story, width) => {});`,
      `Given("an \\"escaped\\" {storybook:story} story", (story) => {});`,
    ].join("\n");
    const { match, errors } = stepsOf([code, "/p/steps.js"]);
    expect(errors).toEqual([]);
    expect(match('die nicht gemountete "Primary" Story')).toMatchObject([
      { exportName: "Primary", unmounted: true },
    ]);
    expect(match('the "Primary" story, at 320 px')).toMatchObject([
      { exportName: "Primary", unmounted: false },
    ]);
    expect(match("an \"escaped\" 'Primary' story")).toMatchObject([
      { exportName: "Primary" },
    ]);
  });

  test("a step two Storybook steps match: both (ambiguous)", () => {
    const { match } = stepsOf([
      [
        `Given("the {storybook:story} story", (story) => {});`,
        `Given("the {storybook:story} story", (story) => {});`,
      ].join("\n"),
      "/p/steps.ts",
    ]);
    expect(match('the "Primary" story')).toHaveLength(2);
  });

  test("the errors: another parameter type in a Storybook step, an expression that can't be read", () => {
    const { errors, match } = stepsOf([
      [
        `Given("the {color} {storybook:story} story", (color, story) => {});`,
        "Given(`the ${word} {storybook:story} story`, (story) => {});",
      ].join("\n"),
      "/p/steps.ts",
    ]);
    expect(errors).toEqual([
      `the Storybook step "the {color} {storybook:story} story" (/p/steps.ts:1) uses {color}: a Storybook step may use only the plugin's placeholders and cucumber's built-in parameter types ({word}, {string}, {int}, …)`,
      "the Storybook step at /p/steps.ts:2 (`the ${word} {storybook:story} story`) can't be read: write its expression as a string literal",
    ]);
    expect(match('the red "Primary" story')).toEqual([]);
  });

  test("more than one of the plugin's placeholders in a Storybook step: an error", () => {
    const { errors, match } = stepsOf([
      [
        `Given("the {storybook:story} story of {storybook:storiesFile}", (story, file) => {});`,
        `Given("the {storybook:story} next to {storybook:story}", (a, b) => {});`,
      ].join("\n"),
      "/p/steps.ts",
    ]);
    expect(errors).toEqual([
      `the Storybook step "the {storybook:story} story of {storybook:storiesFile}" (/p/steps.ts:1) uses {storybook:story}, {storybook:storiesFile}: a Storybook step uses one of the plugin's placeholders, once (a story, an unmounted story, or a stories file)`,
      `the Storybook step "the {storybook:story} next to {storybook:story}" (/p/steps.ts:2) uses {storybook:story}, {storybook:story}: a Storybook step uses one of the plugin's placeholders, once (a story, an unmounted story, or a stories file)`,
    ]);
    expect(match('the "Primary" story of "src/a.stories.ts"')).toEqual([]);
  });

  test("only a step definition's expression: its string on the next line too, another string not", () => {
    const code = [
      `// Not a step: "the {storybook:story} story"`,
      `const text = "the {storybook:story} story";`,
      "cucumber.Given(",
      `  "the {storybook:story} story",`,
      "  (story) => {},",
      ");",
    ].join("\n");
    expect(scanSupportCode(code, "/p/steps.ts")).toEqual([
      { at: "/p/steps.ts:3", source: "the {storybook:story} story" },
    ]);
  });

  test("a support file without Storybook steps: nothing", () => {
    expect(scanSupportCode("this isn't JavaScript {", "/p/a.ts")).toEqual([]);
  });
});
