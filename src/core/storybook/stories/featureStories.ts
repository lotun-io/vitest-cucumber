// Storybook: a feature file as a stories module (`notes/storybook.md`, "The feature file as the CSF
// module"). Storybook indexes it (`../preset.ts`'s indexer for `.feature`), its preview and its story
// tests import it (the preset's transform, `../../storybookPlugin.ts`'s): it imports its stories file
// (`./linkedFeature.ts`), whose meta is its own (Storybook composes a story with the meta of the module
// exporting it), and exports a story per scenario or Outline row: the story it runs on spread (its
// args, render, decorators, loaders), or none (the meta's defaults), its name and tags, its `play`
// the scenario's steps (`../../../worker/storybook/feature.ts`). Its title is the stories file's
// (`./linkedFeature.ts`: the one written there, else Storybook's automatic one), then
// `<Feature keyword>: <name>`: a group per feature under its component, written in the module, so
// Storybook's index, its preview and the addon's story tests make the same ids from it. The
// stories file is never transformed: its stories are ordinary stories, listed and tested there.
import type { GherkinDocument } from "@cucumber/messages";
import path from "node:path";
import { slash } from "../../../utils/slash.ts";
import { featureBase } from "../../feature/featureFile.ts";
import type { ScenarioLink } from "./featureLinks.ts";
import type { StoriesOf } from "./storiesFile.ts";

/** The script extensions a stories file may have. */
export const storiesExtensions = [
  "ts",
  "tsx",
  "js",
  "jsx",
  "mts",
  "mjs",
  "cts",
  "cjs",
];

/**
 * The group a feature's scenarios are listed in: `<Feature keyword>: <name>`, as written (no name: the
 * file's base name, `featureBase`). A `/` would split Storybook's title: it's
 * a `|`, which splits nothing and which Storybook's story ids have as a `-`, as they have a `/`
 * (its `sanitize`: a Unicode slash would stay in the id).
 */
export const featureLabelOf = (document: GherkinDocument, feature: string) => {
  const { keyword = "Feature", name = "" } = document.feature ?? {};
  const label = `${keyword}: ${name.trim() || path.basename(featureBase(feature))}`;
  return label.replaceAll("/", "|");
};

/** A scenario's name as an export's (PascalCase, a valid identifier). */
const exportNameOf = (name: string) => {
  const pascal = name
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean)
    .map((word) => (word[0] ?? "").toUpperCase() + word.slice(1))
    .join("");
  return /^\p{L}/u.test(pascal) ? pascal : `Scenario${pascal}`;
};

/** The scenarios' exports, each a unique identifier (a repeated name numbered: `Kinds`, `Kinds2`). */
export const exportNamesOf = (links: readonly { name: string }[]) => {
  const used = new Set<string>();
  return links.map(({ name }) => {
    const base = exportNameOf(name);
    let exportName = base;
    for (let n = 2; used.has(exportName); n += 1) {
      exportName = `${base}${String(n)}`;
    }
    used.add(exportName);
    return exportName;
  });
};

/** A scenario's story, as the module exports it and Storybook indexes it. */
export interface ScenarioStory extends ScenarioLink {
  /** The module's export. */
  export: string;
  /**
   * Its tags: the story's own, the pickle's, then `!autodocs` and `!manifest` (the meta's come with
   * the meta). Last, so they hold whatever the story it runs on is tagged: a scenario's story has
   * no docs page, and Storybook's manifests read a manifest entry's file as a stories file, which a
   * feature file isn't (a failure there loses every component's manifest).
   */
  storyTags: string[];
}

/**
 * The stories module of feature file `feature` (its Gherkin `document`), linked to `storiesFile`
 * (its `stories`, as Storybook reads them; its title, `storiesTitle`) by `links`; `featureModule`,
 * the feature module's id (its `playAt`). Its title: the stories file's, then the feature's
 * label. Its meta: the stories file's (`metaOf`, its parameters among it). A feature's text for docs: `featuresOf` (by its stories
 * file: `../../../worker/storybook/features.ts`), or Vite's `?raw` import of the file.
 */
export const featureStoriesOf = ({
  feature,
  document,
  storiesFile,
  storiesTitle,
  stories,
  links,
  featureModule,
}: {
  feature: string;
  document: GherkinDocument;
  storiesFile: string;
  storiesTitle: string;
  stories: StoriesOf;
  links: readonly ScenarioLink[];
  featureModule: string;
}) => {
  const label = featureLabelOf(document, feature);
  const title = `${storiesTitle}/${label}`;
  const exportNames = exportNamesOf(links);
  const scenarios: ScenarioStory[] = links.map((link, index) => ({
    ...link,
    export: exportNames[index] ?? "",
    storyTags: [
      ...(link.exportName === undefined
        ? []
        : (stories.tags[link.exportName] ?? [])),
      ...link.tags,
      "!autodocs",
      "!manifest",
    ],
  }));
  let relative = slash(path.relative(path.dirname(feature), storiesFile));
  if (!relative.startsWith(".")) {
    relative = `./${relative}`;
  }
  const json = JSON.stringify;
  const code = [
    `import * as __cucumberStories from ${json(relative)};`,
    `import __cucumberFeature from ${json(featureModule)};`,
    "export default {",
    "  ...__cucumberFeature.metaOf(__cucumberStories.default),",
    `  title: ${json(title)},`,
    `  tags: ${json(stories.metaTags)},`,
    "};",
    ...scenarios.map(
      ({
        export: exportName,
        exportName: story,
        name,
        storyTags,
        line,
        unmounted,
      }) =>
        [
          `export const ${exportName} = {`,
          ...(story === undefined
            ? []
            : [
                `  ...__cucumberFeature.storyOf(__cucumberStories[${json(story)}]),`,
              ]),
          `  name: ${json(name)},`,
          `  tags: ${json(storyTags)},`,
          `  play: __cucumberFeature.playAt(${json({ line, story: story ?? null, unmounted })}),`,
          "};",
        ].join("\n"),
    ),
  ].join("\n");
  return { code, title, label, scenarios };
};
