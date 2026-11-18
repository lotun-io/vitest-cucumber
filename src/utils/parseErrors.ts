// A feature file's parse errors, as the plugin reports them: one error, its first line the
// plugin's name and the file (cucumber's wording, the file unquoted: `Parse error in <uri>`), then each parse
// error on a line of its own, as the Gherkin parser words it (its position first:
// `(line:column): expected: …`). Everywhere (main and the page).
import { pluginErrorMessage } from "./errors.ts";

/** The message of feature file `uri`'s `parseErrors` (`@cucumber/gherkin`'s messages). */
export const parseErrorMessage = (
  uri: string,
  parseErrors: readonly string[],
) => [pluginErrorMessage(`Parse error in ${uri}`), ...parseErrors].join("\n");
