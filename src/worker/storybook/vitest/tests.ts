// A feature file's story tests, as a feature file's tests. Its stories module declares the
// feature's tests itself, as node and browser mode's feature module does: its tree written as
// calls (`../../../core/storybook/stories/featureStoriesModule.ts`: a suite's `describe`, a
// scenario's `storyTest(name, { tags }, place)`), with the calls `storyTests` gives it. The addon
// declares a story test per story after them, in the same module: its generated code's `test`
// and `testStory` are the ones `cucumberTests` gives its feature module
// (`../../../core/storybook/stories/featureRuntimeModule.ts`, `../../../core/storybook/vitest/vitestImport.ts`).
// `testStory` marks the test function of a scenario's story with its scenario (`../scenarioPlay.ts`);
// `test` collects such a test by its Gherkin line instead of declaring it; a `storyTest`'s test
// runs the one collected for its line (looked up as it runs: the addon's calls come after the
// feature's), with `scenarioTestOptions` (its Gherkin tags as Vitest tags; cucumber's timeouts
// unless a tag definition sets one; never concurrent); a scenario without one (left out by
// Storybook's tag filter) skips itself, as the addon's own story tests do for its `skip` tags.
// Each suite and test is put at its Gherkin place, the one its call carries (`locate`), which works
// around Vitest's page (its bug, 5.1.1, to report: plain Storybook has it too, `vitest run
// Cart.stories.ts:5` finds no test where `vitest list` shows one): it puts a task where its call
// is in the module the page was served, and applies a `file:line` filter to that before it reads
// the module's map; the addon prints the module again, so its lines aren't the feature file's (a
// feature module's are, in node and browser mode). Fixed there, `locate` and the calls' places go:
// the map alone places them, as it does for `vitest list`. The map has nothing to say of a place
// set here: the module's code is below the feature's last line
// (`../../../core/storybook/vitest/vitestImport.ts`).
// The file's `beforeAll` uses the worker fixture, which runs BeforeAll and AfterAll
// (`../../feature/workerFixture.ts`). The tests are declared on the addon's `test`, not the
// fixture's: the addon's setup file has an `afterEach((ctx) => …)`, which Vitest rejects for a
// test using fixtures. Any other test is the addon's, as it is.
import type { RunnerTask, SuiteCollector, TestAPI, TestContext } from "vitest";
import * as vitestModule from "vitest";
import type { ImportSupport } from "../../../types/feature.ts";
import type { LoadRun } from "../../../types/platform.ts";
import { useWorkerFixture } from "../../feature/workerFixture.ts";
import { scenarioTestOptions } from "../../platform/scenario/scenarioTestOptions.ts";
import { type PlayedScenario, scenarioOf } from "../scenarioPlay.ts";
import { platform } from "./platform.ts";

/** The addon's `testStory`: its options (only the story is read here), a test function. */
type TestStory = (options: { story?: unknown }) => unknown;

/** A test function, as the addon's `test` gets it. */
type TestFunction = (...args: unknown[]) => unknown;

const scenarioTest = Symbol("vitest-cucumber scenario test");

/** A suite's or a test's Gherkin place, as its call carries it. */
interface Place {
  line: number;
  column: number;
}

/** Puts `task` at its Gherkin `place` (a collected one: a collector has no location). */
const locate = (
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

/** What a feature module's story tests are made from. */
interface StoryTests {
  /** The run the support code loads for (the project's root, its options). */
  run: LoadRun;
  /** The addon's, imported by the feature module (they resolve from the project). */
  testStory: TestStory;
  convertToFilePath: unknown;
}

/**
 * A feature module's exports in story tests (`../../../core/storybook/stories/featureRuntimeModule.ts`
 * writes its call), which its stories module imports: `storyTests` for its own code, and for the
 * addon's test code `testStory`, `convertToFilePath` and `vitest`. The addon's `testStory`
 * marking a scenario's test, Vitest's exports with a `test` collecting the scenarios' tests, and
 * `storyTests`, which takes the support code to load (as the file runs, the worker fixture: not
 * as it's collected; the support files' import is the test file's own module's, as a feature
 * file's module gives it in node and browser mode) and gives back the calls the module declares
 * the feature's tests with. (A feature module that couldn't be made doesn't call this: its
 * exports are written as its code.)
 */
export const storyTestsModule = ({
  run,
  testStory,
  convertToFilePath,
}: StoryTests) => {
  const tests = cucumberTests(vitestModule.test, testStory);
  return {
    testStory: tests.testStory,
    storyTests: ({ importSupport }: { importSupport: ImportSupport }) => {
      platform.use(run, importSupport);
      useWorkerFixture(platform);
      return {
        /** A suite of the feature's (the feature, a rule, an outline), at its Gherkin `place`. */
        describe: (name: string, place: Place, body: () => void) => {
          vitestModule.describe(name, () => {
            locate(vitestModule.TestRunner.getCurrentSuite().suite, place);
            body();
          });
        },
        storyTest: tests.storyTest,
      };
    },
    convertToFilePath,
    vitest: { ...vitestModule, test: tests.test },
  };
};
