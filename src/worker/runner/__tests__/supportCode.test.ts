import { IdGenerator } from "@cucumber/messages";
import { describe, expect, test } from "vitest";
import type { Code, SupportCall } from "../../../types/supportCode.ts";
import { storybookExpressionOf } from "../../../utils/storybookPlaceholders.ts";
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

  test("invalid arguments (cucumber's checks): the plugin's error, the call's location on a line of its own, no stack", () => {
    expect(() =>
      build([{ method: "Given", args: ["a step", 42], location: at(7) }]),
    ).toThrow(
      new Error(
        "[@lotun/vitest-cucumber] Given's second argument should be an object or a function\n  features/steps.ts:7",
      ),
    );
    expect(() =>
      build([{ method: "When", args: [42, () => undefined], location: at(8) }]),
    ).toThrow(
      new Error(
        "[@lotun/vitest-cucumber] When's first argument should be a string or a regular expression\n  features/steps.ts:8",
      ),
    );
    expect(() =>
      build([
        { method: "Then", args: ["a step", {}, "no code"], location: at(9) },
      ]),
    ).toThrow(
      expect.objectContaining({
        message:
          "[@lotun/vitest-cucumber] Then's third argument should be a function\n  features/steps.ts:9",
        stack: "",
      }),
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

  test('BeforeStep/AfterStep with `null` or `""` tags: no filter, as cucumber\'s', () => {
    const support = build([
      {
        method: "BeforeStep",
        args: [{ tags: null }, () => undefined],
        location: at(1),
      },
      {
        method: "AfterStep",
        args: [{ tags: "" }, () => undefined],
        location: at(2),
      },
    ]);
    expect(support.beforeStepHooks[0]?.tags).toBeUndefined();
    expect(support.afterStepHooks[0]?.tags).toBeUndefined();
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

describe("the host's rewrite of a step's cucumber expression (a Storybook host's)", () => {
  const story = {
    method: "Given",
    args: ["the {storybook:story} story", (name: string) => name],
    location: at(3),
  } satisfies SupportCall;
  const stories = {
    method: "Given",
    args: ["the stories of {storybook:storiesFile}", (file: string) => file],
    location: at(4),
  } satisfies SupportCall;
  /** A regular expression's step with a `(\w+)` group: a parameter type of that pattern would be given it. */
  const regexp = {
    method: "Given",
    args: [
      /^a regexp with (\d+) and (\w+)$/,
      (n: number, word: string) => [n, word],
    ],
    location: at(5),
  } satisfies SupportCall;
  const buildWith = (calls: SupportCall[]) =>
    buildSupportCode(calls, {
      newId: IdGenerator.incrementing(),
      expressionOf: storybookExpressionOf,
    });

  test("given: a Storybook step's placeholder is `{string}` (its value quoted, either quote), its definition's pattern so written; no parameter type of the plugin's", () => {
    const support = buildWith([story, stories, regexp]);
    const valuesOf = (text: string) =>
      support.library
        .findAllStepsBy(text)
        .map((match) => match.args.map((arg) => arg.getValue(null)));
    expect(valuesOf('the "LogIn" story')).toEqual([["LogIn"]]);
    expect(valuesOf("the 'LogIn' story")).toEqual([["LogIn"]]);
    expect(valuesOf("the LogIn story")).toEqual([]);
    expect(valuesOf('the stories of "./My Login.stories.ts"')).toEqual([
      ["./My Login.stories.ts"],
    ]);
    // A user's regular expression's groups: no plugin's type to be given (two of one pattern
    // would fail it: cucumber's `AmbiguousParameterTypeError`).
    expect(valuesOf("a regexp with 42 and answer")).toEqual([[42, "answer"]]);
    const envelopes = support.library.toEnvelopes();
    expect(envelopes.filter(({ parameterType }) => parameterType)).toEqual([]);
    expect(
      envelopes.flatMap(({ stepDefinition }) =>
        stepDefinition ? [stepDefinition.pattern.source] : [],
      ),
    ).toEqual([
      "the {string} story",
      "the stories of {string}",
      "^a regexp with (\\d+) and (\\w+)$",
    ]);
  });

  test("none given (node and browser mode): a step using one has an undefined parameter type, and matches nothing", () => {
    const support = build([story]);
    expect(support.library.findAllStepsBy('the "LogIn" story')).toEqual([]);
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

test("a BeforeAll or AfterAll hook on the coordinator: refused, with what to use instead, at the call's location", () => {
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
      new Error(
        `[@lotun/vitest-cucumber] ${method}({ on: "COORDINATOR" }) isn't supported, use Vitest's globalSetup for once-per-run setup\n  features/steps.ts:4`,
      ),
    );
  }
  // Another value: what it should be.
  expect(() =>
    build([
      {
        method: "BeforeAll",
        args: [{ on: "SOMEWHERE" }, () => undefined],
        location: at(5),
      },
    ]),
  ).toThrow(
    new Error(
      '[@lotun/vitest-cucumber] BeforeAll\'s on option should be "WORKER"\n  features/steps.ts:5',
    ),
  );
  // A worker's hook, `on` given or left out (cucumber's default).
  expect(() =>
    build([
      { method: "BeforeAll", args: [{ on: "WORKER" }, () => undefined] },
      { method: "AfterAll", args: [() => undefined] },
    ]),
  ).not.toThrow();
});

test("the methods the plugin doesn't support: refused, with what to use instead, at the call's location", () => {
  expect(() =>
    build([{ method: "setDefaultTimeout", args: [1000], location: at(3) }]),
  ).toThrow(
    new Error(
      "[@lotun/vitest-cucumber] setDefaultTimeout isn't supported, Vitest's testTimeout and hookTimeout are the default timeouts\n  features/steps.ts:3",
    ),
  );
  expect(() =>
    build([
      {
        method: "setParallelCanAssign",
        args: [() => true],
        location: at(6),
      },
    ]),
  ).toThrow(
    new Error(
      "[@lotun/vitest-cucumber] setParallelCanAssign isn't supported, Vitest assigns the feature files to its workers\n  features/steps.ts:6",
    ),
  );
});

test("a function the support code didn't define: the plugin's internal error, not a quiet fallback", () => {
  const support = build([]);
  expect(() => support.definitionOf(() => undefined)).toThrow(
    /a definition the support code didn't define.*a bug in @lotun\/vitest-cucumber/,
  );
});
