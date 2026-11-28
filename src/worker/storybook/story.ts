// The running story (a page runs one at a time: `runStory`), the page's runner, and how a step's code runs in
// it. A story's `play` (`./feature.ts`) runs its target through the runner its page has
// (`./vitest/runner.ts` in story tests, `./preview/runner.ts` in Storybook's preview, a static build's too);
// both platforms run a step's or hook's code as a step of the story (`aroundCall`, Storybook's
// Interactions panel: the runtime's `around`), and the preview adds notes (`storyNote`). One instance
// per page: every import resolves to this file.
import type { ScenarioToRun } from "../../types/platform.ts";
import type { FeatureModel } from "../../types/storybook.ts";
import { pluginError } from "../../utils/errors.ts";
import { storybookExpressionOf } from "../../utils/storybookPlaceholders.ts";
import { createRuntimeEnvironment } from "../browser/runtimeEnvironment.ts";
import { scenarioAt } from "../platform/scenario/scenarioAt.ts";

/** Storybook's `mount`: renders the story (the renderer's arguments, e.g. React's element, or none). */
type StoryMount = (...args: unknown[]) => Promise<unknown>;

/** A story's context, as the plugin reads it (Storybook's `StoryContext` has more). */
export interface StoryContextLike {
  /** Storybook's `step`: its `play` returns nothing (a step's result is kept outside it). */
  step?: (label: string, play: () => Promise<void>) => Promise<void> | void;
  /** Storybook's `mount`, in an unmounted scenario's play (`./feature.ts`). */
  mount?: StoryMount;
}

/** What a story's `play` runs: the scenario, or Outline row, at `line` of a feature file. */
interface StoryTarget extends FeatureModel {
  line: number;
}

/**
 * A page's runner: runs a story's target (a scenario, or an Outline's row). Story tests run cucumber's
 * BeforeAll and AfterAll on the worker fixture; the preview's runner runs them too
 * (`./preview/runner.ts`'s `PreviewRunner`).
 */
export interface PageRunner {
  /** Runs `scenario` (the story's target's, `../platform/scenario/scenarioAt.ts`). */
  run(scenario: ScenarioToRun): Promise<void>;
}

let runner: PageRunner | undefined;
let current: StoryContextLike | undefined;
/** The story playing (its run), if any: the next one waits for it. */
let playing: Promise<void> | undefined;

/** Sets the page's runner. */
export const setRunner = (pageRunner: PageRunner) => {
  runner = pageRunner;
};

/**
 * Runs `target` (its scenario: the pickle at its line) for `context`'s story, on the page's runner,
 * once the story playing ends: a page runs one story at a time (the running story, the page's World
 * and its uncaught errors' listeners are its own). Storybook's preview reloads the page as another
 * story is chosen or the story is remounted mid-play, but not as an HMR update re-renders it: its
 * new play starts as the old one still runs (its steps run to their end, their timeouts bound it).
 */
export const runStory = async (
  context: StoryContextLike,
  target: StoryTarget,
) => {
  const pageRunner = runner;
  if (!pageRunner) {
    throw pluginError(
      "no cucumber runner in this page, add cucumber({ … }) from @lotun/vitest-cucumber/storybook/node to the addons in .storybook/main.ts",
      { quiet: true },
    );
  }
  const before = playing;
  const run = (async () => {
    // The story playing ends first, however it ends (its outcome its own play's).
    await before?.catch(() => undefined);
    current = context;
    try {
      await pageRunner.run(scenarioAt(target, target.line));
    } finally {
      current = undefined;
    }
  })();
  playing = run;
  try {
    await run;
  } finally {
    if (playing === run) {
      playing = undefined;
    }
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
 * A Storybook page's runtime environment: the browser's, each step's code a step of the story, and
 * the Storybook steps' placeholders as `{string}` (node and browser mode keep them as written).
 */
export const storyEnvironment = () => ({
  ...createRuntimeEnvironment(),
  around: aroundCall,
  expressionOf: storybookExpressionOf,
});

/** Adds an empty step labelled `label` to the running story (a skip, an annotation). */
export const storyNote = (label: string) => {
  void current?.step?.(label, async () => undefined);
};
