// A feature file's parse errors, as the plugin reports them: one error, `feature file can't be
// parsed`, each parse error under it as the Gherkin parser words it, its place (`path:line:column`)
// on a line of its own (`locatedErrors`; the parser's own `(line:column): ` prefix dropped: the
// place says it). Main's (a feature file is parsed there: `./plans.ts`).
import type { ParseError } from "@cucumber/messages";
import { locatedErrors } from "../../utils/errors.ts";

/** The error of feature file `uri`'s `parseErrors` (`@cucumber/gherkin`'s). */
export const parseErrorOf = (uri: string, parseErrors: readonly ParseError[]) =>
  locatedErrors(
    "feature file can't be parsed",
    parseErrors.map(({ message, source: { location } }) => ({
      message: message.replace(/^\(\d+:\d+\): /, ""),
      at: [
        [uri, location?.line, location?.column]
          .filter((part) => part !== undefined)
          .join(":"),
      ],
    })),
  );
