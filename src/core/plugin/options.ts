// The plugin's options as cucumber's configuration. Only the options the plugin supports are passed
// on (anything else given, untyped, is dropped), and cucumber's own configuration file is ignored.
import { loadConfiguration, type IConfiguration } from "@cucumber/cucumber/api";
import type { CucumberOptions, RunOptions } from "../../types/feature.ts";
import { checkWorldParameters } from "./worldParameters.ts";

/** The options passed on to cucumber: exactly `CucumberOptions`'s keys. */
const supportedOptions = [
  "import",
  "dryRun",
  "backtrace",
  "language",
  "strict",
  "worldParameters",
] as const satisfies readonly (keyof CucumberOptions)[];
// A key of `CucumberOptions` missing from the list above is a compile error here.
const everyOption: Exclude<
  keyof CucumberOptions,
  (typeof supportedOptions)[number]
> extends never
  ? true
  : never = true;
void everyOption;

/** Cucumber's configuration of `options`, resolved in `cwd`. */
export const configurationOf = async (
  options: CucumberOptions,
  cwd: string,
): Promise<IConfiguration> => {
  const { useConfiguration } = await loadConfiguration(
    {
      file: false,
      provided: Object.fromEntries(
        supportedOptions
          .filter((name) => options[name] !== undefined)
          .map((name) => [name, options[name]]),
      ),
    },
    { cwd },
  );
  checkWorldParameters(useConfiguration.worldParameters);
  return useConfiguration;
};

/** Of cucumber's resolved configuration, what the runtime reads (`RunOptions`). */
export const runOptionsOf = ({
  strict,
  dryRun,
  worldParameters,
}: IConfiguration): RunOptions => ({ strict, dryRun, worldParameters });
