// A feature module's exports in story tests: the feature's story tests' calls
// (`./cucumberTests.ts`: how a scenario's story test is collected and run as the feature file's
// own test, at its Gherkin place), given the page's platform. The file's `beforeAll` uses the
// worker fixture, which runs BeforeAll and AfterAll (`../../feature/workerFixture.ts`).
import * as vitestModule from "vitest";
import type { ImportSupport } from "../../../types/feature.ts";
import type { LoadRun } from "../../../types/platform.ts";
import { useWorkerFixture } from "../../feature/workerFixture.ts";
import {
  cucumberTests,
  locate,
  type Place,
  type TestStory,
} from "./cucumberTests.ts";
import { platform } from "./platform.ts";

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
