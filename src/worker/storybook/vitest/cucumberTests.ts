// A feature file's story tests' calls, as a feature file's tests (`./tests.ts` gives them to a
// feature module: `storyTestsModule`). Its stories module declares the feature's tests itself, as
// node and browser mode's feature module does: its tree written as calls
// (`../../../core/storybook/stories/featureStoriesModule.ts`: a suite's `describe`, a scenario's
// `storyTest(name, { tags }, place)`). The addon declares a story test per story after them, in
// the same module: its generated code's `test` and `testStory` are the ones `cucumberTests` gives
// (`../../../core/storybook/stories/featureRuntimeModule.ts`, `../../../core/storybook/vitest/vitestImport.ts`).
// `testStory` marks the test function of a scenario's story with its scenario (`../scenarioPlay.ts`);
// `test` collects such a test by its Gherkin line instead of declaring it; a `storyTest`'s test
// runs the one collected for its line (looked up as it runs: the addon's calls come after the
// feature's), with `scenarioTestOptions` (its Gherkin tags as Vitest tags; cucumber's timeouts
// unless a tag definition sets one; never concurrent); a scenario without one (left out by
// Storybook's tag filter) skips itself, as the addon's own story tests do for its `skip` tags.
// Each suite and test is put at its Gherkin place, the one its call carries (`locate`), which works
// around Vitest's page (its bug, 5.1.1 and 5.1.2: `notes/issues.md` 32; plain Storybook has it too, `vitest run
// Cart.stories.ts:5` finds no test where `vitest list` shows one): it puts a task where its call
// is in the module the page was served, and applies a `file:line` filter to that before it reads
// the module's map; the addon prints the module again, so its lines aren't the feature file's (a
// feature module's are, in node and browser mode). Fixed there, `locate` and the calls' places go:
// the map alone places them, as it does for `vitest list`. The map has nothing to say of a place
// set here: the module's code is below the feature's last line
// (`../../../core/storybook/vitest/vitestImport.ts`).
// The tests are declared on the addon's `test`, not the worker fixture's: the addon's setup file
// has an `afterEach((ctx) => …)`, which Vitest rejects for a test using fixtures. Any other test
// is the addon's, as it is. Nothing here needs a page (its unit test runs in Node): the page's
// platform is `./tests.ts`'s.
import type { RunnerTask, SuiteCollector, TestAPI, TestContext } from "vitest";
import * as vitestModule from "vitest";
import { scenarioTestOptions } from "../../platform/scenario/scenarioTestOptions.ts";
import { type PlayedScenario, scenarioOf } from "../scenarioPlay.ts";

/** The addon's `testStory`: its options (only the story is read here), a test function. */
export type TestStory = (options: { story?: unknown }) => unknown;

/** A test function, as the addon's `test` gets it. */
type TestFunction = (...args: unknown[]) => unknown;

const scenarioTest = Symbol("vitest-cucumber scenario test");

/** A suite's or a test's Gherkin place, as its call carries it. */
export interface Place {
  line: number;
  column: number;
}

/** Puts `task` at its Gherkin `place` (a collected one: a collector has no location). */
export const locate = (
  task: RunnerTask | SuiteCollector | undefined,
  { line, column }: Place,
) => {
  if (task && task.type !== "collector") {
    task.location = { line, column };
  }
};

/** A story's `play` (CSF 3: `story.play`). */
const playOf = (story: unknown): unknown =>
  typeof story === "object" && story !== null && "play" in story
    ? story.play
    : undefined;

/**
 * A feature file's `test` and `testStory` (Vitest's `test`, the addon's `testStory`), and its
 * `storyTest` (a scenario's test). Each stories module calls it once, as it loads.
 */
export const cucumberTests = (test: TestAPI, testStory: TestStory) => {
  const collected = new Map<number, TestFunction>();
  const declare = test as (...args: unknown[]) => unknown;
  return {
    testStory: (options: Parameters<TestStory>[0]) => {
      const fn = testStory(options);
      const scenario = scenarioOf(playOf(options.story));
      return scenario && typeof fn === "function"
        ? Object.assign(fn, { [scenarioTest]: scenario })
        : fn;
    },
    test: (name: string, ...rest: unknown[]) => {
      const fn = rest.at(-1) as
        ({ [scenarioTest]?: PlayedScenario } & TestFunction) | undefined;
      const scenario = fn?.[scenarioTest];
      if (fn && scenario) {
        collected.set(scenario.line, fn);
        return undefined;
      }
      return declare(name, ...rest);
    },
    /**
     * Declares the test of the scenario, or example, at Gherkin `place`, with its Gherkin tags: the
     * addon's story test collected for its line, or, none collected, skipped.
     */
    storyTest: (name: string, { tags }: { tags: string[] }, place: Place) => {
      declare(name, scenarioTestOptions(tags), (context: TestContext) => {
        const fn = collected.get(place.line);
        return fn ? fn(context) : context.skip();
      });
      locate(vitestModule.TestRunner.getCurrentSuite().tasks.at(-1), place);
    },
  };
};
