// The scenario a test or a story runs: the pickle at a line of its feature file (a scenario's, or an
// Outline row's), with what the platform needs to run it. Its name is the pickle's, as its test's or
// story's (both are the compiled names). Page-safe.
import type { FeatureGherkin } from "../../../types/feature.ts";
import type { ScenarioToRun } from "../../../types/platform.ts";
import { pluginError } from "../../../utils/errors.ts";

/** The pickle at `line` of `gherkin`, if one is there. */
export const pickleAt = (gherkin: FeatureGherkin | undefined, line: number) =>
  gherkin?.pickles.find(({ location }) => location?.line === line);

/** The scenario at `line` of the feature at `uri`: an error if there's none. */
export const scenarioAt = (
  { uri, gherkin }: { uri: string; gherkin: FeatureGherkin | undefined },
  line: number,
): ScenarioToRun => {
  const pickle = pickleAt(gherkin, line);
  if (!gherkin || !pickle) {
    throw pluginError(`no scenario at line ${String(line)} of ${uri}`, {
      internal: true,
    });
  }
  return { uri, name: pickle.name, document: gherkin.document, pickle };
};
