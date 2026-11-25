// The scenario a test or a story runs: the pickle at a line of its feature file (a scenario's, or an
// Outline row's), with what the platform needs to run it. Its name is the pickle's, as its test's or
// story's (both are the compiled names). Page-safe.
import type { FeatureGherkin } from "../../../types/feature.ts";
import type { ScenarioToRun } from "../../../types/platform.ts";
import { pluginError } from "../../../utils/errors.ts";

/** The scenario at `line` of the feature at `uri` (its pickle there): an error if there's none. */
export const scenarioAt = (
  { uri, gherkin }: { uri: string; gherkin: FeatureGherkin },
  line: number,
): ScenarioToRun => {
  const pickle = gherkin.pickles.find(
    ({ location }) => location?.line === line,
  );
  if (!pickle) {
    throw pluginError(`no scenario at line ${String(line)} of ${uri}`, {
      internal: true,
    });
  }
  return { uri, name: pickle.name, document: gherkin.document, pickle };
};
