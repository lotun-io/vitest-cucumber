// The plugin's options, each with its value: cucumber's default where none is given (its
// `DEFAULT_CONFIGURATION`). Only these six are read: anything else given, untyped, is ignored, and
// cucumber's own configuration file is never read. No cucumber code runs for it (until 2026-11-20
// cucumber's `loadConfiguration` did this: 125 ms and 44 MB of its modules for these defaults).
import { dialects } from "@cucumber/gherkin";
import type { CucumberOptions, RunOptions } from "../../types/feature.ts";
import { pluginError } from "../../utils/errors.ts";
import { jsonWorldParameters } from "./worldParameters.ts";

/** The plugin's options, every one set. */
export type Configuration = Required<CucumberOptions>;

/**
 * `options` with cucumber's defaults; its `worldParameters` as the Worlds get them
 * (`./worldParameters.ts`). Throws for `import` globs or a `language` that can't be used.
 */
export const configurationOf = (options: CucumberOptions): Configuration => {
  const configuration: Configuration = {
    import: options.import ?? [],
    dryRun: options.dryRun ?? false,
    backtrace: options.backtrace ?? false,
    language: options.language ?? "en",
    strict: options.strict ?? true,
    worldParameters: jsonWorldParameters(options.worldParameters ?? {}),
  };
  const { import: globs, language } = configuration;
  if (!Array.isArray(globs) || globs.some((glob) => typeof glob !== "string")) {
    throw pluginError(`the "import" option must be an array of strings`, {
      quiet: true,
    });
  }
  if (!Object.hasOwn(dialects, language)) {
    throw pluginError(
      `the "language" option "${language}" isn't a Gherkin language`,
      { quiet: true },
    );
  }
  return configuration;
};

/** Of the configuration, what the runtime reads (`RunOptions`). */
export const runOptionsOf = ({
  strict,
  dryRun,
  worldParameters,
}: Configuration): RunOptions => ({ strict, dryRun, worldParameters });
