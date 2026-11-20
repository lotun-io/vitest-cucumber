// Storybook: a Storybook project's cucumber options are its config folder's options file,
// `<configDir>/cucumber.config.ts` (`../plugin/optionsFile.ts`), for both of Storybook's hosts:
// Storybook's own process (the preset: `./preset/project.ts`) and its story tests
// (`cucumber()` in the addon's Vitest project, whose given options aren't used there:
// `../plugin/projectOptions.ts`), the config folder the one `storybookTest()` was given.
import path from "node:path";
import { pluginError } from "../../utils/errors.ts";
import { fromWorkingDirectory, optionsFileIn } from "../plugin/optionsFile.ts";

/** `configDir`'s options file. None is an error naming it. */
export const storybookOptionsFile = (configDir: string) => {
  const file = optionsFileIn(configDir);
  if (file) {
    return file;
  }
  throw pluginError(
    `${fromWorkingDirectory(path.join(configDir, "cucumber.config.ts"))} is missing`,
    { quiet: true },
  );
};
