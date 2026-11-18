// Storybook: what the plugin reads of a story's context, and a feature file as a stories file's
// import of it gets it (see `../worker/storybook/`, `../core/storybook/`).
import type { Actions } from "./commands.ts";
import type { FeatureGherkin } from "./feature.ts";
import type { ScenarioToRun } from "./platform.ts";

/** Storybook's `mount`: renders the story (the renderer's arguments, e.g. React's element, or none). */
export type StoryMount = (...args: unknown[]) => Promise<unknown>;

/** A story's context, as the plugin reads it (Storybook's `StoryContext` has more). */
export interface StoryContextLike {
  /** Storybook's `step`: its `play` returns nothing (a step's result is kept outside it). */
  step?: (label: string, play: () => Promise<void>) => Promise<void> | void;
  /** Storybook's `mount`, in an unmounted scenario's play (`../worker/storybook/feature.ts`). */
  mount?: StoryMount;
}

/**
 * A feature file, as a stories file's import of it gets it (`../core/storybook/stories/featureRuntimeModule.ts`): its
 * Gherkin document and pickles, which the page runs (a story plays the pickle at its line).
 */
export interface FeatureModel {
  uri: string;
  gherkin: FeatureGherkin;
}

/** What a story's `play` runs: the scenario, or Outline row, at `line` of a feature file. */
export interface StoryTarget extends FeatureModel {
  line: number;
}

/** A frame as the page's stack has it: the script's URL, its line and column (1-based). */
export interface RawFrame {
  url: string;
  line: number;
  column: number;
}

/**
 * Storybook's preview in `storybook dev`: the page asks the dev server where its support code calls
 * were made, as browser mode's page asks main (`Actions["locate"]`: the recorded stacks, a
 * location or none for each), over Vite's HMR connection (`../worker/storybook/preview/locate.ts`,
 * `../core/storybook/preset/locate.ts`): a request, and its answer (the same `id`), as Storybook's own
 * request/response (`experimental_requestResponse`: an id, an answer even on an error, a timeout).
 */
export type LocateRequest = { id: number } & Actions["locate"][0];

/** The answer: the locations, or the dev server's error (as Storybook's request/response answers). */
export type LocateResponse =
  | { id: number; locations: Actions["locate"][1] }
  | { id: number; error: string };

/** The scenario a play plays: its line (its pickle's), the story it runs on (none: the meta), its tags. */
export interface PlayedScenario {
  line: number;
  exportName: string | null;
  tags: string[];
}

/**
 * A page's runner: runs a story's target (a scenario, or an Outline's row). Story tests run cucumber's
 * BeforeAll and AfterAll on the worker fixture; the preview's runner runs them too (`PreviewRunner`).
 */
export interface PageRunner {
  /** Runs `scenario` (the story's target's, `../worker/platform/scenario/scenarioAt.ts`). */
  run(scenario: ScenarioToRun): Promise<void>;
}

/** Storybook's preview's runner: also cucumber's BeforeAll and AfterAll, its project `beforeAll`'s. */
export interface PreviewRunner extends PageRunner {
  beforeAll(): Promise<void>;
  afterAll(): Promise<void>;
}

/** A feature file of a stories file, for docs (`featuresOf`): its path and its Gherkin. */
export interface FeatureSource {
  /** Its path from the project's root, as Storybook writes a file's (`./src/Header.feature`). */
  fileName: string;
  /** Its Gherkin, as written. */
  source: string;
}
