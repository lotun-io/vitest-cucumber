import { IdGenerator } from "@cucumber/messages";
import { describe, expect, test } from "vitest";
import type { Code, SupportCall } from "../../../types/supportCode.ts";
import { storybookParameterTypes } from "../../../utils/storybookParameterTypes.ts";
import { buildSupportCode } from "../supportCode.ts";

const at = (line: number) => ({ uri: "features/steps.ts", line, column: 1 });
const build = (
  calls: SupportCall[],
  wrapper?: (code: Code, options: unknown) => Code,
) => buildSupportCode(calls, { newId: IdGenerator.incrementing(), wrapper });

describe("steps", () => {
  test("a cucumber expression, a regular expression, options: matched by core, with their own definition", () => {
    const first = (n: number) => n;
    const second = (word: string) => word;
    const support = build([
      {
        method: "Given",
        args: ["I have {int} cucumbers", first],
        location: at(3),
      },
      {
        method: "When",
        args: [/^I eat (\w+)$/, { timeout: 50 }, second],
        location: at(4),
      },
    ]);
    const [match] = support.library.findAllStepsBy("I have 3 cucumbers");
    expect(match?.args.map((arg) => arg.getValue(null))).toEqual([3]);
    expect(match?.def.sourceReference).toEqual({
      uri: "features/steps.ts",
      location: { line: 3 },
    });
    expect(support.definitionOf(match?.def.fn)?.code).toBe(first);
    const [eat] = support.library.findAllStepsBy("I eat apples");
    expect(support.definitionOf(eat?.def.fn)).toMatchObject({
      code: second,
      timeout: 50,
    });
  });

  test("a definition's function keeps its code's length (cucumber reads it for callbacks)", () => {
    const support = build([
      {
        method: "Then",
        args: ["done", (callback: () => void) => void callback],
        location: at(1),
      },
    ]);
    expect(support.library.findAllStepsBy("done")[0]?.def.fn.length).toBe(1);
  });

  test("cucumber's error for invalid arguments, at the call's location", () => {
    expect(() =>
      build([{ method: "Given", args: ["a step", 42], location: at(7) }]),
    ).toThrow(
      "features/steps.ts:7: Invalid second argument: should be a object or function",
    );
    expect(() =>
      build([
        { method: "Given", args: [42, () => undefined], location: at(8) },
      ]),
    ).toThrow(
      "features/steps.ts:8: Invalid first argument: should be a string or regular expression",
    );
  });
});

describe("hooks", () => {
  test("Before/After: options, tags as a string, the code alone; selected by tags", () => {
    const tagged = () => undefined;
    const plain = () => undefined;
    const support = build([
      { method: "Before", args: ["@slow", tagged], location: at(1) },
      {
        method: "Before",
        args: [{ name: "setup", timeout: 10 }, plain],
        location: at(2),
      },
      { method: "After", args: [plain], location: at(3) },
    ]);
    expect(support.library.findAllBeforeHooksBy(["@slow"])).toHaveLength(2);
    const [named] = support.library.findAllBeforeHooksBy([]);
    expect(named?.name).toBe("setup");
    expect(support.definitionOf(named?.fn)).toMatchObject({
      code: plain,
      timeout: 10,
    });
    expect(support.library.findAllAfterHooksBy([])).toHaveLength(1);
  });

  test("BeforeStep/AfterStep stay here, with their tags compiled", () => {
    const support = build([
      {
        method: "BeforeStep",
        args: [{ tags: "@a and not @b" }, () => undefined],
        location: at(1),
      },
      { method: "AfterStep", args: [() => undefined], location: at(2) },
    ]);
    expect(support.beforeStepHooks[0]?.tags?.evaluate(["@a"])).toBe(true);
    expect(support.beforeStepHooks[0]?.tags?.evaluate(["@a", "@b"])).toBe(
      false,
    );
    expect(support.afterStepHooks).toHaveLength(1);
  });

  test("BeforeAll/AfterAll: core's run hooks", () => {
    const support = build([
      {
        method: "BeforeAll",
        args: [{ timeout: 5 }, () => undefined],
        location: at(1),
      },
      { method: "AfterAll", args: [() => undefined], location: at(2) },
    ]);
    const [beforeAll] = support.library.getAllBeforeAllHooks();
    expect(support.definitionOf(beforeAll?.fn)?.timeout).toBe(5);
    expect(support.library.getAllAfterAllHooks()).toHaveLength(1);
  });
});

test("parameter types: cucumber's defaults, the transformer called with `this`", () => {
  const support = build([
    {
      method: "defineParameterType",
      args: [
        {
          name: "color",
          regexp: /red|blue/,
          transformer(this: { prefix: string }, value: string) {
            return `${this.prefix}${value}`;
          },
        },
      ],
      location: at(1),
    },
    {
      method: "Given",
      args: ["a {color} ball", () => undefined],
      location: at(2),
    },
  ]);
  const [match] = support.library.findAllStepsBy("a red ball");
  expect(match?.args[0]?.getValue({ prefix: "#" })).toBe("#red");
});

describe("the host's own parameter types (a Storybook host's)", () => {
  const story = {
    method: "Given",
    args: ["the {storybook:story} story", (name: string) => name],
    location: at(3),
  } satisfies SupportCall;
  const parameterTypes = Object.values(storybookParameterTypes);
  const buildWith = (calls: SupportCall[]) =>
    buildSupportCode(calls, {
      newId: IdGenerator.incrementing(),
      parameterTypes,
    });

  test("given: every one defined, with no source of its own, before the support code's steps", () => {
    const support = buildWith([
      story,
      {
        method: "Given",
        args: [
          "the stories of {storybook:storiesFile}",
          (file: string) => file,
        ],
        location: at(4),
      },
    ]);
    const [match] = support.library.findAllStepsBy("the LogIn story");
    expect(match?.args.map((arg) => arg.getValue(null))).toEqual(["LogIn"]);
    const [file] = support.library.findAllStepsBy(
      "the stories of ./Login.stories.ts",
    );
    expect(file?.args.map((arg) => arg.getValue(null))).toEqual([
      "./Login.stories.ts",
    ]);
    expect(
      support.library
        .toEnvelopes()
        .flatMap(({ parameterType }) => (parameterType ? [parameterType] : []))
        .map(({ name, sourceReference }) => ({ name, sourceReference })),
    ).toEqual(
      parameterTypes.map(({ name }) => ({ name, sourceReference: {} })),
    );
  });

  test("the support code defined them itself: its own, none added", () => {
    const own = parameterTypes.map(
      ({ name }, index) =>
        ({
          method: "defineParameterType",
          args: [
            {
              name,
              regexp: /\w+/,
              transformer: (text: string) => `own ${text}`,
            },
          ],
          location: at(index + 1),
        }) satisfies SupportCall,
    );
    const support = buildWith([...own, story]);
    const [match] = support.library.findAllStepsBy("the LogIn story");
    expect(match?.args.map((arg) => arg.getValue(null))).toEqual(["own LogIn"]);
  });

  test("none given (node and browser mode): a step using one has an undefined parameter type, and matches nothing", () => {
    const support = build([story]);
    expect(support.library.findAllStepsBy("the LogIn story")).toEqual([]);
    expect(
      support.library
        .toEnvelopes()
        .flatMap(({ parameterType, undefinedParameterType }) => [
          ...(parameterType ? [parameterType.name] : []),
          ...(undefinedParameterType ? [undefinedParameterType.name] : []),
        ]),
    ).toEqual(["storybook:story"]);
  });
});

test("the definition function wrapper wraps every definition, with the step's wrapper options", () => {
  const seen: unknown[] = [];
  const support = build(
    [
      {
        method: "Given",
        args: [
          "wrapped",
          { wrapperOptions: { retry: 2 } },
          (value: unknown) => `step${value === undefined ? "" : "!"}`,
        ],
        location: at(1),
      },
      { method: "Before", args: [() => "hook"], location: at(2) },
    ],
    (code, options) => {
      seen.push(options);
      return (...args: unknown[]) => `wrapped ${String(code(...args))}`;
    },
  );
  const step = support.definitionOf(
    support.library.findAllStepsBy("wrapped")[0]?.def.fn,
  );
  expect(step?.code()).toBe("wrapped step");
  expect(step?.code.length).toBe(1);
  expect(
    support
      .definitionOf(support.library.findAllBeforeHooksBy([])[0]?.fn)
      ?.code(),
  ).toBe("wrapped hook");
  expect(seen).toEqual([{ retry: 2 }, undefined]);
});

test("the World class", () => {
  class CustomWorld {
    readonly custom = true;
  }
  const support = build([
    { method: "setWorldConstructor", args: [CustomWorld] },
  ]);
  expect(support.World).toBe(CustomWorld);
});

test("a BeforeAll or AfterAll hook on the coordinator: a validation error, in cucumber's form", () => {
  for (const method of ["BeforeAll", "AfterAll"]) {
    expect(() =>
      build([
        {
          method,
          args: [{ on: "COORDINATOR" }, () => undefined],
          location: at(4),
        },
      ]),
    ).toThrow(
      'features/steps.ts:4: Invalid "options.on": "COORDINATOR" isn\'t supported, BeforeAll and AfterAll hooks run in each Vitest worker',
    );
  }
  // A worker's hook, `on` given or left out (cucumber's default).
  expect(() =>
    build([
      { method: "BeforeAll", args: [{ on: "WORKER" }, () => undefined] },
      { method: "AfterAll", args: [() => undefined] },
    ]),
  ).not.toThrow();
});

test("a function the support code didn't define: the plugin's internal error, not a quiet fallback", () => {
  const support = build([]);
  expect(() => support.definitionOf(() => undefined)).toThrow(
    /a definition the support code didn't define.*a bug in @lotun\/vitest-cucumber/,
  );
});
