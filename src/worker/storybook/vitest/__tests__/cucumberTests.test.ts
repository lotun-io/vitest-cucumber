import { describe, expect, test, type TestAPI } from "vitest";
import { withProvided } from "../../../../__tests__/withProvided.ts";
import { markScenario } from "../../scenarioPlay.ts";
import { cucumberTests } from "../cucumberTests.ts";

/** The stories whose test ran, by their export. */
const ranStories: string[] = [];

/** The addon's `testStory`, here: a test function saying which story it ran. */
const testStory = ({ story }: { story?: unknown }) => {
  const { name } = story as { name: string };
  return () => {
    ranStories.push(name);
  };
};

/** A scenario's story (its `play` marked with its line), and any other story. */
const scenarioStory = (name: string, line: number) => ({
  name,
  play: markScenario(async () => undefined, { line }),
});
const plainStory = (name: string) => ({ name, play: async () => undefined });

describe("a feature file's story tests, declared on Vitest's own `test` as its stories module declares them", () => {
  const tests = cucumberTests(test, testStory);

  // The feature's tests, as its stories module writes them: before the addon's.
  tests.storyTest("Adding an item", { tags: [] }, { line: 3, column: 3 });
  tests.storyTest("Left out by a tag", { tags: [] }, { line: 7, column: 5 });

  // The addon's story tests, as its transform writes them after: a scenario's is collected
  // by its line, any other declared as it is.
  tests.test(
    "Adding an item",
    tests.testStory({ story: scenarioStory("AddingAnItem", 3) }),
  );
  tests.test(
    "A story of the stories file's own",
    tests.testStory({ story: plainStory("Plain") }),
  );

  test("each scenario's test ran the story test collected for its line, a scenario with none (Storybook's tag filter) skipped itself, and the addon's other tests ran as they are", ({
    task,
  }) => {
    // The three declared through `cucumberTests`, before this file's own two.
    const declared = (task.suite?.tasks ?? [])
      .slice(0, 3)
      .map(({ name, result }) => [name, result?.state]);
    expect(declared).toEqual([
      ["Adding an item", "pass"],
      ["Left out by a tag", "skip"],
      ["A story of the stories file's own", "pass"],
    ]);
    // A scenario's story test is declared once: as the feature's, not as the addon's too.
    expect(ranStories).toEqual(["AddingAnItem", "Plain"]);
  });

  test("each scenario's test is at its Gherkin place, the one its call carries", ({
    task,
  }) => {
    const [adding, leftOut, plain] = task.suite?.tasks ?? [];
    expect(adding?.location).toEqual({ line: 3, column: 3 });
    expect(leftOut?.location).toEqual({ line: 7, column: 5 });
    // The addon's own test: Vitest's place for it, none set here.
    expect(plain?.location).not.toEqual({ line: 7, column: 5 });
  });
});

describe("a scenario's test's options", () => {
  // A project defining the tag `@slow` with a timeout.
  withProvided({ timedTags: ["@slow"] });

  /**
   * Three scenarios' story tests declared, in a test (the project's values set): what was declared
   * (a `test` that only records its calls: a tag Vitest's config doesn't define can't be declared).
   */
  const declare = () => {
    const declared: unknown[][] = [];
    const record = (...args: unknown[]) => {
      declared.push(args);
    };
    const tests = cucumberTests(record as unknown as TestAPI, testStory);
    tests.storyTest("Plain", { tags: [] }, { line: 3, column: 3 });
    tests.storyTest("Tagged", { tags: ["@smoke"] }, { line: 5, column: 3 });
    tests.storyTest("Slow", { tags: ["@slow"] }, { line: 7, column: 3 });
    return { declared, tests };
  };

  test("its Gherkin tags as Vitest's, never concurrent, cucumber's own timeouts unless one of its tags is defined with one", () => {
    const { declared } = declare();
    expect(declared.map(([name, options]) => [name, options])).toEqual([
      ["Plain", { tags: [], timeout: 0, concurrent: false }],
      ["Tagged", { tags: ["@smoke"], timeout: 0, concurrent: false }],
      // `@slow` has a timeout: Vitest's applies.
      ["Slow", { tags: ["@slow"], concurrent: false }],
    ]);
  });

  test("a scenario's story test given to `test` is collected, not declared; anything else is declared as it is", () => {
    const { declared, tests } = declare();
    const before = declared.length;
    const own = () => undefined;
    expect(
      tests.test(
        "Plain",
        tests.testStory({ story: scenarioStory("Plain", 3) }),
      ),
    ).toBeUndefined();
    tests.test("The addon's own", { retry: 1 }, own);
    expect(declared.slice(before)).toEqual([
      ["The addon's own", { retry: 1 }, own],
    ]);
  });
});
