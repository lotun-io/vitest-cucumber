// A scenario story's `play` (`./feature.ts`'s `playAt`), marked as one, with its pickle's line, its
// story and its tags: its story test is collected by that line and declared as the feature file's
// scenario's (`./vitest/tests.ts`).
// Page-safe.
import type { PlayedScenario } from "../../types/storybook.ts";

/** Each scenario story's `play`, and the scenario it plays. */
const scenarios = new WeakMap<object, PlayedScenario>();

/** `play`, marked as playing `scenario`. */
export const markScenario = <Play extends object>(
  play: Play,
  scenario: PlayedScenario,
): Play => {
  scenarios.set(play, scenario);
  return play;
};

/** The scenario `play` plays, if it plays one. */
export const scenarioOf = (play: unknown): PlayedScenario | undefined =>
  typeof play === "function" ? scenarios.get(play) : undefined;
