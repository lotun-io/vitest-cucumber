import { expect, test } from "vitest";
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

test("a stories module: its code; with an error: the host's failing lines, then a meta and no story", () => {
  const made = {
    uri: "a.feature",
    tags: [],
    featureTree: { name: "A", line: 1, column: 1, children: [] },
    gherkin: { document: { comments: [] }, pickles: [] },
    link: { key: "" },
    options: {},
    supportFiles: [],
    storybookSteps: false,
    stories: { code: "the code", label: "Feature: A" },
  };
  expect(storiesModule(made)).toBe("the code");
  expect(storiesModulePreview(made)).toBe("the code");
  expect(storiesModule({ error })).toBe(
    [describeImport, ...failingSuite, "export default {};"].join("\n"),
  );
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
    tags: [],
    featureTree: { name: "A", line: 1, column: 1, children: [] },
    link: { key: "" },
    options: {},
    supportFiles: ["/p/steps.ts"],
    storybookSteps: true,
    stories: { code: "the code", label: "Feature: A" },
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
      "export const { testStory, declareFeature, convertToFilePath, vitest } = storyTestsModule({",
      "  testStory: addonTestStory,",
      "  convertToFilePath: addonConvertToFilePath,",
      '  run: {"cwd":"/p","options":{},"storybookSteps":true},',
      `  tree: ${JSON.stringify(plan.featureTree)},`,
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

test("the support module, from its support plan: the support files' import, the run's options, whether they have a Storybook step; its hot update reloads the page", () => {
  const code = supportModuleCode({
    cwd: "/p",
    plan: {
      options: { strict: true },
      supportFiles: ["/p/steps.ts"],
      storybookSteps: true,
    },
  });
  expect(code).toContain("export const storybookSteps = true;");
  expect(code).toContain('await import("/p/steps.ts");');
  expect(code).toContain('export const options = {"strict":true};');
  expect(code).toContain('export const cwd = "/p";');
  expect(code).toContain("import.meta.hot.accept(() => location.reload());");
});
