// A feature file's story tests, as a feature file's tests (the addon declares them in its stories
// module: its generated code's `test` and `testStory` are the ones `cucumberTests` gives its feature
// module: `../../../core/storybook/stories/featureRuntimeModule.ts`, `../../../core/storybook/vitest/vitestImport.ts`).
// `testStory` marks the test function of a scenario's story with its scenario (`../scenarioPlay.ts`);
// `test` collects such a test by its Gherkin line instead of declaring it; `declareFeature`, called
// after the addon's tests, declares the feature's tests as node and browser mode do
// (`../../feature/registerFeature.ts`: its suites, each test at its Gherkin line, so Vitest's own
// `file:line` filters apply), each with its collected story test: `scenarioTestOptions` (its Gherkin
// tags as Vitest tags; cucumber's timeouts unless a tag definition sets one; never concurrent); a
// scenario without one (left out by Storybook's tag filter) skipped. The file's `beforeAll` uses the
// worker fixture, which runs BeforeAll and AfterAll (`../../feature/workerFixture.ts`). The tests are
// declared on the addon's `test`, not the fixture's: the addon's setup file has an
// `afterEach((ctx) => …)`, which Vitest rejects for a test using fixtures. Any other test is the
// addon's, as it is.
import type { TestAPI } from "vitest";
import * as vitestModule from "vitest";
import type { FeatureSuite, ImportSupport } from "../../../types/feature.ts";
import type { LoadRun } from "../../../types/platform.ts";
import type { PlayedScenario } from "../../../types/storybook.ts";
import { registerFeature } from "../../feature/registerFeature.ts";
import { useWorkerFixture } from "../../feature/workerFixture.ts";
import { scenarioTestOptions } from "../../platform/scenario/scenarioTestOptions.ts";
import { scenarioOf } from "../scenarioPlay.ts";
import { platform } from "./platform.ts";

/** The addon's `testStory`: its options (only the story is read here), a test function. */
type TestStory = (options: { story?: unknown }) => unknown;

/** A test function, as the addon's `test` gets it. */
type TestFunction = (...args: unknown[]) => unknown;

const scenarioTest = Symbol("vitest-cucumber scenario test");

/** A story's `play` (CSF 3: `story.play`). */
const playOf = (story: unknown): unknown =>
  typeof story === "object" && story !== null && "play" in story
    ? story.play
    : undefined;

/**
 * A feature file's `test` and `testStory` (Vitest's `test`, the addon's `testStory`), and its
 * `declareFeature` (its tests' tree, `tree`). Each stories module calls it once, as it loads.
 */
export const cucumberTests = (
  test: TestAPI,
  testStory: TestStory,
  tree: FeatureSuite,
) => {
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
    /** Declares the feature's tests, after the addon's (each its scenario's collected story test). */
    declareFeature: () => {
      useWorkerFixture(platform);
      registerFeature(tree, ({ name, line, tags }) => {
        const fn = collected.get(line);
        if (fn) {
          declare(name, scenarioTestOptions(tags), fn);
        } else {
          test.skip(name, scenarioTestOptions(tags), () => undefined);
        }
      });
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
  /** The feature's tests' tree. */
  tree: FeatureSuite;
}

/**
 * A feature module's exports in story tests (`../../../core/storybook/stories/featureRuntimeModule.ts`
 * writes its call), which its stories module's test code imports: `testStory` and
 * `convertToFilePath`, `declareFeature`, and `vitest`. The addon's `testStory` marking a
 * scenario's test, Vitest's exports with a `test` collecting the scenarios' tests, and
 * `declareFeature` declaring them as the feature's tree, with the support code to load (as the
 * file runs, the worker fixture: not as it's collected): the support files' import is the test
 * file's own module's, given here, as a feature file's module gives it in node and browser
 * mode. (A feature module that couldn't be made doesn't call this: its exports are written as
 * its code.)
 */
export const storyTestsModule = ({
  run,
  testStory,
  convertToFilePath,
  tree,
}: StoryTests) => {
  const tests = cucumberTests(vitestModule.test, testStory, tree);
  return {
    testStory: tests.testStory,
    declareFeature: ({ importSupport }: { importSupport: ImportSupport }) => {
      platform.use(run, importSupport);
      tests.declareFeature();
    },
    convertToFilePath,
    vitest: { ...vitestModule, test: tests.test },
  };
};
