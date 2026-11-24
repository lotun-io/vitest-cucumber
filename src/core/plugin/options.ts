// The plugin's options, each with its value: cucumber's default where none is given (its
// `DEFAULT_CONFIGURATION`), but for `import`, which must be given. Only these six are read: anything else given, untyped, is ignored, and
// cucumber's own configuration file is never read. No cucumber code runs for it (until 2026-11-20
// cucumber's `loadConfiguration` did this: 125 ms and 44 MB of its modules for these defaults).
import { dialects } from "@cucumber/gherkin";
import type { CucumberOptions, RunOptions } from "../../types/feature.ts";
import { pluginError } from "../../utils/errors.ts";
import { jsonWorldParameters } from "./worldParameters.ts";

/** The plugin's options, every one set. */
export type Configuration = Required<CucumberOptions>;

/**
 * `options` (as a config gives them, whatever their type says: none at all from JavaScript) with
 * cucumber's defaults; its `worldParameters` as the Worlds get them (`./worldParameters.ts`). Throws
 * for an `import` missing or not an array of strings, and a `language` that can't be used.
 */
export const configurationOf = (
  options: Partial<CucumberOptions> = {},
): Configuration => {
  const globs: unknown = options.import;
  if (
    !Array.isArray(globs) ||
    !globs.every((glob): glob is string => typeof glob === "string")
  ) {
    throw pluginError(
      `the "import" option is required: an array of your support code's globs, e.g. ["features/**/*.ts"]`,
      { quiet: true },
    );
  }
  const configuration: Configuration = {
    import: globs,
    dryRun: options.dryRun ?? false,
    backtrace: options.backtrace ?? false,
    language: options.language ?? "en",
    strict: options.strict ?? true,
    worldParameters: jsonWorldParameters(options.worldParameters ?? {}),
  };
  const { language } = configuration;
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
