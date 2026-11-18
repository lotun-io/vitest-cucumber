// The `worldParameters` option's values: each feature module carries the configuration as a JSON
// literal, so values `JSON.stringify` refuses (a `bigint`, a cycle) fail the run as it starts.
import { pluginError } from "../../utils/errors.ts";

/** Throws if `JSON.stringify` refuses `worldParameters`, its error the cause. */
export const checkWorldParameters = (worldParameters: unknown) => {
  try {
    JSON.stringify(worldParameters);
  } catch (error) {
    throw pluginError(
      `the worldParameters config option can't be converted to JSON`,
      { cause: error, quiet: true },
    );
  }
};
