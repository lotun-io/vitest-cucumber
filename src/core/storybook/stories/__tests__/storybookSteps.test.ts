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

  test("a step definition with TypeScript's type arguments: found as any other", () => {
    const code = [
      `Given<StoryWorld>("the {storybook:story} story", (_story: string) => {});`,
      `When <Ctx<StoryWorld>> ("the unmounted {storybook:storyUnmounted} story", () => {});`,
      "Then<StoryWorld>(",
      `  "the stories of {storybook:storiesFile}",`,
      "  () => {},",
      ");",
    ].join("\n");
    expect(scanSupportCode(code, "/p/steps.ts")).toEqual([
      { at: "/p/steps.ts:1", source: "the {storybook:story} story" },
      {
        at: "/p/steps.ts:2",
        source: "the unmounted {storybook:storyUnmounted} story",
      },
      { at: "/p/steps.ts:3", source: "the stories of {storybook:storiesFile}" },
    ]);
  });

  test("a Storybook step in a comment, an old copy: none (cucumber defines no step there), the others' lines as they are", () => {
    const code = [
      `// Given("the {storybook:story} story", (_story: string) => {});`,
      `/*`,
      `Given("the {storybook:story} story", () => {});`,
      `*/`,
      `Given("the {storybook:story} story", (_story: string) => {});`,
    ].join("\n");
    expect(scanSupportCode(code, "/p/steps.ts")).toEqual([
      { at: "/p/steps.ts:5", source: "the {storybook:story} story" },
    ]);
    // One step: a story step matches it alone, not ambiguous.
    const { match, errors } = stepsOf([code, "/p/steps.ts"]);
    expect(errors).toEqual([]);
    expect(match('the "Primary" story')).toHaveLength(1);
  });

  describe("code that isn't a step definition's, before one: the step found, at its line", () => {
    const step = `Given("the {storybook:story} story", () => {});`;
    /** The lines of the Storybook steps found in `code` (support file `file`). */
    const linesOf = (code: string, file = "/p/steps.ts") =>
      scanSupportCode(code, file).map(({ at }) =>
        at.slice(at.lastIndexOf(":") + 1),
      );

    test.each([
      ["a // in a string", `const url = "https://x.org/a"; // c`],
      ["a // in a regular expression", String.raw`const re = /a\/\/b/; // c`],
      [
        "a /* in a regular expression's class",
        String.raw`const re = /[/*]/; // c`,
      ],
      ["a division, then a comment", `const half = count / 2; // c /`],
      [
        "TypeScript's non-null assertion, then a division",
        `const half = count! / 2; // c`,
      ],
      ["TypeScript's as, then a division", `const r = (n as number) / 2; // c`],
      [
        "a generic call, then a regular expression",
        String.raw`const ok = test<string>(x) && /a\/b/.test(y); // c`,
      ],
      ["TypeScript's <Type>value", `const w = <StoryWorld>world; // c`],
      ["a template with ${} and a //", "const t = `a ${b} // ${`c`}`; // c"],
    ])("%s", (_name, before) => {
      expect(linesOf(`${before}\n${step}`)).toEqual(["2"]);
    });

    test.each([
      ["a generic arrow function", `const id = <T,>(x: T) => x; // c`],
      [
        "a generic arrow function with extends",
        `const id = <T extends unknown>(x: T) => x; // c`,
      ],
      [
        "a JSX element with a // in it",
        `const el = <Button label="a//b">x // y</Button>; // c`,
      ],
      ["JSX text with an apostrophe", `const el = <p>Don't click</p>;`],
      ["JSX text with /*", `const el = <p>a /* b</p>;`],
      ["JSX text with a backtick", "const el = <p>a ` b</p>;"],
      ["a JSX comment, a step in it", `const el = <p>{/* ${step} */}</p>;`],
    ])("a .tsx file: %s", (_name, before) => {
      expect(linesOf(`${before}\n${step}`, "/p/steps.tsx")).toEqual(["2"]);
    });

    test("text that isn't ASCII before it: its line all the same", () => {
      expect(linesOf(`const s = "čšž 😀";\n// 😀 ${step}\n${step}`)).toEqual([
        "3",
      ]);
    });
  });

  test("a template literal: over several lines too; with ${} it can't be read, its whole text", () => {
    expect(
      scanSupportCode(
        "Given(\n  `the\n{storybook:story} story`,\n  () => {},\n);",
        "/p/a.ts",
      ),
    ).toEqual([{ at: "/p/a.ts:1", source: "the\n{storybook:story} story" }]);
    expect(
      scanSupportCode(
        "Given(`the {storybook:story} ${x}`, () => {});",
        "/p/a.ts",
      ),
    ).toEqual([
      { at: "/p/a.ts:1", unreadable: "`the {storybook:story} ${x}`" },
    ]);
  });

  test("a definition under the name the file gives it: imported or destructured, from any module", () => {
    const code = [
      `import { Given as Step, "When" as Act } from "@cucumber/cucumber";`,
      `import { Then as Outcome } from "./world";`,
      `const { defineStep: define = () => {} } = require("@cucumber/cucumber");`,
      `Step("the {storybook:story} story", () => {});`,
      `Act("the unmounted {storybook:storyUnmounted} story", () => {});`,
      `define("the stories of {storybook:storiesFile}", () => {});`,
      `Outcome("the {storybook:story} outcome", () => {});`,
      `import { Before as Hook } from "@cucumber/cucumber";`,
      `Hook("the {storybook:story} hook", () => {});`,
      `other("the {storybook:story} story", () => {});`,
    ].join("\n");
    expect(scanSupportCode(code, "/p/steps.ts")).toEqual([
      { at: "/p/steps.ts:4", source: "the {storybook:story} story" },
      {
        at: "/p/steps.ts:5",
        source: "the unmounted {storybook:storyUnmounted} story",
      },
      { at: "/p/steps.ts:6", source: "the stories of {storybook:storiesFile}" },
      { at: "/p/steps.ts:7", source: "the {storybook:story} outcome" },
    ]);
  });

  test("a support file without Storybook steps: nothing", () => {
    expect(
      scanSupportCode(`Given("I click {string}", () => {});`, "/p/a.ts"),
    ).toEqual([]);
  });

  test("a support file that can't be parsed: its first error, at its line, the features' error", () => {
    const step = `Given("the {storybook:story} story", () => {});`;
    for (const [code, line, message] of [
      [
        `${step}\n/* never closed\n${step}`,
        2,
        "Unterminated multiline comment",
      ],
      [`${step}\nconst s = "never closed\n${step}`, 2, "Unterminated string"],
      ["this isn't JavaScript {", 1, ""],
    ] as const) {
      const [found] = scanSupportCode(code, "/p/a.ts");
      expect(found?.at, code).toBe(`/p/a.ts:${String(line)}`);
      expect(found?.unparsable, code).toContain(message);
      expect(stepsOf([code, "/p/a.ts"]).errors, code).toEqual([
        `the support file /p/a.ts:${String(line)} can't be parsed: ${found?.unparsable ?? ""}`,
      ]);
    }
  });
});
