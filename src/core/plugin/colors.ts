// Whether Vitest's output has colors, decided as Vitest decides it (for example, off in an AI agent's
// run). Cucumber's summaries use the same choice.
import { stripVTControlCharacters } from "node:util";
import type { Vitest } from "vitest/node";

/** Formats an error with Vitest's printer (writing nothing) and checks it for color codes. */
export const colorsOf = (vitest: Vitest) => {
  const { output } = vitest.logger.formatError(new Error(""));
  return stripVTControlCharacters(output) !== output;
};
