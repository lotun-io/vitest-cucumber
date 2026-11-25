// The worker's unit tests' Gherkin: a feature's document and pickles from its text, as main gives
// them to a feature module (`../../core/feature/plan.ts`), made here without main.
import {
  AstBuilder,
  compile,
  GherkinClassicTokenMatcher,
  Parser,
} from "@cucumber/gherkin";
import { IdGenerator } from "@cucumber/messages";
import type { FeatureGherkin } from "../../types/feature.ts";

/** The Gherkin document and pickles of feature file `uri`, whose text is `source`. */
export const gherkinOf = (source: string, uri: string): FeatureGherkin => {
  const newId = IdGenerator.incrementing();
  const document = {
    ...new Parser(
      new AstBuilder(newId),
      new GherkinClassicTokenMatcher(),
    ).parse(source),
    uri,
  };
  return { document, pickles: [...compile(document, uri, newId)] };
};
