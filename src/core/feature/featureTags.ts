// A feature file's Gherkin tags, for Vitest's tag definitions (`../plugin/tags.ts`): read from its
// Gherkin document, as cucumber parses it. A file outside a run is parsed for its document alone
// (`tagsOf`: no pickles, no test tree); a planned one's come from its plan's document
// (`tagsOfDocument`). Kept with the file's plan (`./plans.ts`).
import { generateMessages } from "@cucumber/gherkin";
import type { GherkinDocument } from "@cucumber/messages";
import { mediaTypeOf } from "./plan.ts";

/**
 * The tags of a feature file's `document`: its feature's, its rules', its scenarios' and their
 * examples' (the tags its tests have, each test its pickle's: all of these, inherited). None
 * without a document (a file that doesn't parse: it fails with its parse errors as it runs).
 */
export const tagsOfDocument = (document: GherkinDocument | undefined) => {
  const tags = new Set<string>();
  const add = (named: readonly { name: string }[] = []) => {
    for (const { name } of named) {
      tags.add(name);
    }
  };
  const feature = document?.feature;
  add(feature?.tags);
  for (const child of feature?.children ?? []) {
    add(child.rule?.tags);
    for (const { scenario } of [child, ...(child.rule?.children ?? [])]) {
      add(scenario?.tags);
      for (const examples of scenario?.examples ?? []) {
        add(examples.tags);
      }
    }
  }
  return [...tags];
};

/** The tags of the feature file `uri`, `content`, parsed for its document alone. */
export const tagsOf = (
  content: string,
  uri: string,
  language: string,
): string[] => {
  let next = 0;
  let document: GherkinDocument | undefined;
  for (const { gherkinDocument } of generateMessages(
    content,
    uri,
    mediaTypeOf(content, uri),
    {
      defaultDialect: language,
      includeGherkinDocument: true,
      includePickles: false,
      newId: () => String(next++),
    },
  )) {
    document ??= gherkinDocument;
  }
  return tagsOfDocument(document);
};
