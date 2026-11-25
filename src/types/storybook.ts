// Storybook: what main and the page share (`../core/storybook/`, `../worker/storybook/`): a feature
// file as a stories file's import of it gets it, the preview's locate request and its answer, a
// stories file's features for docs. What only the page uses is next to its users
// (`../worker/storybook/`).
import type { Actions } from "./commands.ts";
import type { FeatureGherkin } from "./feature.ts";

/**
 * A feature file, as a stories file's import of it gets it (`../core/storybook/stories/featureRuntimeModule.ts`): its
 * Gherkin document and pickles, which the page runs (a story plays the pickle at its line).
 */
export interface FeatureModel {
  uri: string;
  gherkin: FeatureGherkin;
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

/** A feature file of a stories file, for docs (`featuresOf`): its path and its Gherkin. */
export interface FeatureSource {
  /** Its path from the project's root, as Storybook writes a file's (`./src/Header.feature`). */
  fileName: string;
  /** Its Gherkin, as written. */
  source: string;
}
