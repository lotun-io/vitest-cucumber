// Storybook: one story per id. Storybook makes a story's id from its meta's `id` and its export
// (`toId(meta id, storyNameFromExport(export))`, `<meta>--<story>`: case and punctuation dropped)
// and keeps one story per id (its index the first, its preview the last), so two of a feature's
// scenarios with one id (the same name, names differing in case or punctuation only, an Outline's
// rows its name doesn't tell apart, a scenario named as the feature's own story) would be one
// story. Each is an error naming them and the id (the user's call, 2026-11-27: a name to change,
// not a number added; node and browser mode run them as cucumber does). The ids are made by
// Storybook's own functions (`storybook/internal/csf`), as Storybook will make them.
import type { GherkinDocument, Scenario } from "@cucumber/messages";
import { exampleName } from "../../feature/featureTree.ts";

/** Storybook's functions making ids (`storybook/internal/csf`'s). */
export interface StorybookIds {
  toId: (kind: string, name?: string) => string;
  storyNameFromExport: (key: string) => string;
}

/** A story of a feature's module: its export, the line it comes from, its name as shown. */
export interface ModuleStory {
  export: string;
  line: number;
  name: string;
}

/**
 * What each line of `document` that a story comes from is: a scenario's keyword as written, an
 * Outline's row its language's `Example` keyword (as an unnamed row is named: `featureTree.ts`).
 */
const kindsOf = (document: GherkinDocument) => {
  const kinds = new Map<number, string>();
  const example = exampleName(document.feature?.language ?? "en");
  const add = (scenario: Scenario | undefined) => {
    if (!scenario) {
      return;
    }
    kinds.set(scenario.location.line, scenario.keyword.trim());
    for (const examples of scenario.examples) {
      for (const row of examples.tableBody) {
        kinds.set(row.location.line, example);
      }
    }
  };
  for (const child of document.feature?.children ?? []) {
    add(child.scenario);
    for (const ruleChild of child.rule?.children ?? []) {
      add(ruleChild.scenario);
    }
  }
  return kinds;
};

/**
 * The errors of feature file `uri` (its Gherkin `document`) whose module's `stories` (the feature's
 * own story first: `own`) have an id another has, under meta id `metaId`: one per id, each story
 * at its line.
 */
export const sameIdErrorsOf = ({
  uri,
  document,
  metaId,
  own,
  stories,
  ids,
}: {
  uri: string;
  document: GherkinDocument;
  metaId: string;
  /** The feature's own story's export. */
  own: string;
  stories: readonly ModuleStory[];
  ids: StorybookIds;
}): string[] => {
  const kinds = kindsOf(document);
  const featureLine = document.feature?.location.line ?? 1;
  /** Each id's stories: where each is, what it is. */
  const byId = new Map<string, string[]>();
  const all = [{ export: own, line: featureLine, name: undefined }, ...stories];
  for (const story of all) {
    const id = ids.toId(metaId, ids.storyNameFromExport(story.export));
    const what =
      story.name === undefined
        ? "the plugin's own story of the feature"
        : `${kinds.get(story.line) ?? "Scenario"}: ${JSON.stringify(story.name)}`;
    byId.set(id, [
      ...(byId.get(id) ?? []),
      `- ${uri}:${String(story.line)} (${what})`,
    ]);
  }
  return [...byId]
    .filter(([, same]) => same.length > 1)
    .map(([id, same]) =>
      [
        `scenarios would be the same story in Storybook (id ${JSON.stringify(id)}):`,
        ...same,
      ].join("\n"),
    );
};
