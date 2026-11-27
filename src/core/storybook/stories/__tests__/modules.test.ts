import { DecodedMap, getOriginalPosition } from "@vitest/utils/source-map";
import { Tag } from "storybook/preview-api";
import { expect, test } from "vitest";
import { defaultRunOptions } from "../../../../utils/runOptions.ts";
import { errorCode } from "../../../utils/errorCode.ts";
import { ownModule } from "../../../utils/ownModule.ts";
import { supportModuleCode } from "../../preset/supportModule.ts";
import {
  featureModule,
  featureModulePreview,
} from "../featureRuntimeModule.ts";
import {
  storiesModule,
  storiesModulePreview,
} from "../featureStoriesModule.ts";

const error = new Error('the plugin\'s "error"\non two lines');

test("an error as code: its name, and its whole text as its message (its stack's frames included, no stack of its own); its cause too", () => {
  const make = (error: Error) =>
    new Function(`return ${errorCode(error)};`)() as Error;
  // The plugin's own (no stack): its message.
  expect(
    make(Object.assign(new Error('a "quoted"\nmessage'), { stack: "" })),
  ).toMatchObject({ name: "Error", message: 'a "quoted"\nmessage', stack: "" });
  // Any other: its stack as its message, without its name (printed before it).
  const bug = Object.assign(new TypeError("x is undefined"), {
    stack: "TypeError: x is undefined\n    at f (a.ts:1:2)",
  });
  expect(make(bug)).toMatchObject({
    name: "TypeError",
    message: "x is undefined\n    at f (a.ts:1:2)",
    stack: "",
  });
  // A stack without the message (changed since it was made): the message, then the stack.
  const changed = Object.assign(new Error("new"), {
    stack: "Error: old\n    at g (b.ts:3:4)",
  });
  expect(make(changed).message).toBe("new\nError: old\n    at g (b.ts:3:4)");
  // Its cause, the same way.
  const made = make(
    Object.assign(new Error("outer", { cause: bug }), { stack: "" }),
  );
  expect(made.cause).toMatchObject({
    name: "TypeError",
    message: "x is undefined\n    at f (a.ts:1:2)",
    stack: "",
  });
  // A cause that is the error itself: written once.
  const circular = new Error("circular");
  circular.cause = circular;
  expect(errorCode(circular)).not.toContain("cause");
});

// Each module's generator (one per host), given its data or the error: one block of code, the
// data's defaults with an error, and the error's lines added last.

const thrown = `throw ${errorCode(error)};`;
const describeImport = `import { describe } from "vitest";`;
const failingSuite = [`describe("feature", () => {`, `  ${thrown}`, "});"];

test("a stories module: its code, in story tests then the feature's tests as calls, each at its Gherkin line by its map; with an error: the host's failing lines, then a meta and no story", () => {
  const made = {
    uri: "a.feature",
    content:
      "Feature: A\n\n  @smoke @tag(!dev)\n  Scenario: One\n    Given a step\n",
    tags: [],
    featureTree: {
      name: "A",
      line: 1,
      column: 1,
      // The plan's Vitest tags: `@tag(!dev)` is its story's (Storybook's own), not its test's
      // (left out as the plan is made: `../storybookPlan.ts`).
      children: [{ name: "One", line: 4, column: 3, tags: ["@smoke"] }],
    },
    gherkin: { document: { comments: [] }, pickles: [] },
    link: { key: "" },
    options: defaultRunOptions,
    supportFiles: ["/p/steps.ts"],
    stories: {
      code: "the code",
      title: "T/Feature: A",
      titles: {},
    },
  };
  const file = "/p/a.feature";
  const { code, map } = storiesModule({ file, plan: made, tag: Tag });
  expect(code).toBe(
    [
      "the code",
      `import { storyTests as __cucumberStoryTests } from "/p/a.feature?vitest-cucumber-storybook";`,
      "const { describe, storyTest } = __cucumberStoryTests({ importSupport: async () => {",
      '  await import("/p/steps.ts");',
      "} });",
      'describe("A", { line: 1, column: 1 }, () => {',
      "",
      "",
      'storyTest("One", { tags: ["@smoke"] }, { line: 4, column: 3 }); });',
      "",
      "",
    ].join("\n"),
  );
  if (!map) {
    throw new Error("no map");
  }
  const decoded = new DecodedMap(JSON.parse(map.toString()), file);
  // The feature's suite (the module's line 6) and its scenario's test (line 9), at their keywords.
  expect(getOriginalPosition(decoded, { line: 6, column: 0 })).toMatchObject({
    line: 1,
    column: 0,
  });
  expect(getOriginalPosition(decoded, { line: 9, column: 0 })).toMatchObject({
    line: 4,
    column: 2,
  });
  // The stories' code: no mapping.
  expect(getOriginalPosition(decoded, { line: 1, column: 0 })).toBeNull();
  expect(storiesModulePreview(made)).toBe("the code");
  // A broken feature's: its suite throwing, then its own story alone, hidden by its meta's tags.
  const failed = storiesModule({ file, plan: { error }, tag: Tag });
  expect(failed.code).toBe(
    [
      describeImport,
      ...failingSuite,
      'export default { tags: ["!dev","!test","!autodocs","!manifest"] };',
      "export const __vitestCucumberFeature = {};",
    ].join("\n"),
  );
  expect(failed.map).toBeUndefined();
  expect(storiesModulePreview({ error })).toBe(
    [thrown, "export default {};"].join("\n"),
  );
});

test("a feature module, from its feature's plan: story tests' exports the runtime's, the preview's default export; a failed plan's throws its error", () => {
  const model = {
    uri: "a.feature",
    gherkin: { document: { comments: [] }, pickles: [] },
  };
  const plan = {
    ...model,
    content: "Feature: A\n",
    tags: [],
    featureTree: { name: "A", line: 1, column: 1, children: [] },
    link: { key: "" },
    options: defaultRunOptions,
    supportFiles: ["/p/steps.ts"],
    stories: {
      code: "the code",
      title: "T/Feature: A",
      titles: {},
    },
  };
  const own = (module: string) => JSON.stringify(ownModule(module));
  expect(featureModule({ cwd: "/p", plan })).toBe(
    [
      `import { createFeature } from ${own("worker/storybook/feature")};`,
      "import {",
      "  testStory as addonTestStory,",
      "  convertToFilePath as addonConvertToFilePath,",
      `} from "@storybook/addon-vitest/internal/test-utils";`,
      `import { storyTestsModule } from ${own("worker/storybook/vitest/tests")};`,
      "export const { testStory, storyTests, convertToFilePath, vitest } = storyTestsModule({",
      "  testStory: addonTestStory,",
      "  convertToFilePath: addonConvertToFilePath,",
      `  run: {"cwd":"/p","options":${JSON.stringify(defaultRunOptions)}},`,
      "});",
      `export default createFeature(${JSON.stringify(model)});`,
    ].join("\n"),
  );
  expect(featureModulePreview(plan)).toBe(
    [
      `import { createFeature } from ${own("worker/storybook/feature")};`,
      `export default createFeature(${JSON.stringify(model)});`,
    ].join("\n"),
  );
  const failed = { error };
  expect(featureModule({ cwd: "/p", plan: failed })).toBe(thrown);
  expect(featureModulePreview(failed)).toBe(thrown);
});

test("the support module, from its support plan: the support files' import, the run's options; its hot update reloads the page", () => {
  const code = supportModuleCode({
    cwd: "/p",
    plan: {
      options: { ...defaultRunOptions, strict: false },
      supportFiles: ["/p/steps.ts"],
    },
  });
  expect(code).not.toContain("storybookSteps");
  expect(code).toContain('await import("/p/steps.ts");');
  expect(code).toContain(
    'export const options = {"strict":false,"dryRun":false,"worldParameters":{}};',
  );
  expect(code).toContain('export const cwd = "/p";');
  expect(code).toContain("import.meta.hot.accept(() => location.reload());");
});
