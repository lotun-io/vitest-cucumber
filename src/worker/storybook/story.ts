// The running story (a page runs one at a time), the page's runner, and how a step's code runs in
// it. A story's `play` (`./feature.ts`) runs its target through the runner its page has
// (`./vitest/runner.ts` in story tests, `./preview/runner.ts` in Storybook's preview, a static build's too);
// both platforms run a step's or hook's code as a step of the story (`aroundCall`, Storybook's
// Interactions panel: the runtime's `around`), and the preview adds notes (`storyNote`). One instance
// per page: every import resolves to this file.
import type { LoadRun } from "../../types/platform.ts";
import type {
  PageRunner,
  StoryContextLike,
  StoryTarget,
} from "../../types/storybook.ts";
import { pluginError } from "../../utils/errors.ts";
import { storybookParameterTypes } from "../../utils/storybookParameterTypes.ts";
import { createRuntimeEnvironment } from "../browser/runtimeEnvironment.ts";
import { scenarioAt } from "../platform/scenario/scenarioAt.ts";

let runner: PageRunner | undefined;
let current: StoryContextLike | undefined;

/** Sets the page's runner. */
export const setRunner = (pageRunner: PageRunner) => {
  runner = pageRunner;
};

/** Runs `target` (its scenario: the pickle at its line) for `context`'s story, on the page's runner. */
export const runStory = async (
  context: StoryContextLike,
  target: StoryTarget,
) => {
  if (!runner) {
    throw pluginError(
      "no cucumber runner in this page (is `@lotun/vitest-cucumber/storybook` in Storybook's addons, and `cucumber()` in the Vitest config?)",
      { quiet: true },
    );
  }
  current = context;
  try {
    await runner.run(scenarioAt(target, target.line));
  } finally {
    current = undefined;
  }
};

/** The running story's context, if any. */
export const currentStory = () => current;

/**
 * A step's or hook's code, as a step of the running story (the runtime's `around`): the Interactions
 * panel shows the Gherkin step, its own interactions nested in it, failed if its code failed (its
 * real error thrown in the story's step, which marks it; the runtime has its outcome already).
 * Storybook's instrumented `step` doesn't give back its function's result: it's kept here.
 */
const aroundCall = async <T extends { failure?: { value: unknown } }>(
  label: string,
  run: () => Promise<T>,
): Promise<T> => {
  if (!current?.step) {
    return run();
  }
  let outcome: T | undefined;
  try {
    await current.step(label, async () => {
      outcome = await run();
      if (outcome.failure) {
        throw outcome.failure.value;
      }
    });
  } catch (error) {
    if (!outcome) {
      throw error;
    }
  }
  return outcome as T;
};

/**
 * A Storybook page's runtime environment for `run`: the browser's, each step's code a step of the
 * story, and the Storybook steps' parameter types if a support file has such a step (main's scan,
 * the run's `storybookSteps`: main links by the steps it finds, so the page defines the types
 * exactly then).
 */
export const storyEnvironment = (run: LoadRun) => ({
  ...createRuntimeEnvironment(),
  around: aroundCall,
  ...(run.storybookSteps && {
    parameterTypes: Object.values(storybookParameterTypes),
  }),
});

/** Adds an empty step labelled `label` to the running story (a skip, an annotation). */
export const storyNote = (label: string) => {
  void current?.step?.(label, async () => undefined);
};
