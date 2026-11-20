// The `worldParameters` option's values: each feature module carries the configuration as a JSON
// literal, so they're taken through JSON once, as the options are read: main holds what the Worlds
// get (a value JSON changes, changed: a `Date` a string), and values `JSON.stringify` refuses (a
// `bigint`, a cycle) fail the run as it starts.
import type { CucumberOptions } from "../../types/feature.ts";
import { pluginError } from "../../utils/errors.ts";

type WorldParameters = NonNullable<CucumberOptions["worldParameters"]>;

/** `worldParameters` through JSON. Throws if JSON refuses a value, its error the cause. */
export const jsonWorldParameters = (
  worldParameters: WorldParameters,
): WorldParameters => {
  try {
    return JSON.parse(JSON.stringify(worldParameters));
  } catch (error) {
    throw pluginError(
      `the "worldParameters" option can't be converted to JSON`,
      { cause: error, quiet: true },
    );
  }
};
