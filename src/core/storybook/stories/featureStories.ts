// Storybook: a feature file as a stories module (`notes/storybook.md`, "The feature file as the CSF
// module"). Storybook indexes it (`../preset/indexer.ts`), its preview and its story
// tests import it (the preview's transform, `../preset/previewPlugin.ts`; story tests', `../../storybookPlugin.ts`): it imports its stories file
// (`./linkedFeature.ts`), whose meta is its own (Storybook composes a story with the meta of the module
// exporting it), and exports a story per scenario or Outline row: the story it runs on spread (its
// args, render, decorators, loaders), or none (the meta's defaults), its name and tags, its `play`
// the scenario's steps (`../../../worker/storybook/feature.ts`). Its title is the stories file's
// (`./linkedFeature.ts`: the one written there, else Storybook's automatic one), then
// `<Feature keyword>: <name>`: a group per feature under its component. Each story's own title
// is its test's place in Vitest's tree (`../../feature/featureTree.ts`'s `placesOf`, the user's
// call, 2026-11-20): its rule's name, then its outline's (an example: a story of the outline's
// component) or its own (a scenario: a component of one story of the same name, which Storybook's
// sidebar shows as the story alone); its name its test's. The module writes one title, so its meta
// writes an `id` (the feature's): Storybook's index (each entry its own title: `./indexEntries.ts`),
// its preview (the entry's title) and the addon's story tests (the module's title) make the same
// ids from it. The stories file is never transformed: its stories are ordinary stories, listed and
// tested there.
import type { GherkinDocument } from "@cucumber/messages";
import path from "node:path";
import type { FeatureSuite } from "../../../types/feature.ts";
import { slash } from "../../../utils/slash.ts";
import { featureBase } from "../../feature/featureFile.ts";
import { placesOf } from "../../feature/featureTree.ts";
import type { ScenarioLink } from "./featureLinks.ts";
import type { StoriesOf } from "./storiesFile.ts";
import { storyTagsOf } from "./storybookTags.ts";

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

/** A name as a title's part: a `/` would split it, a `|` splits nothing (the feature's label too). */
const segmentOf = (name: string) => name.replaceAll("/", "|");

/**
 * The group a feature's scenarios are listed in: `<Feature keyword>: <name>`, as written (no name: the
 * file's base name, `featureBase`). A `/` would split Storybook's title: it's
 * a `|`, which splits nothing and which Storybook's story ids have as a `-`, as they have a `/`
 * (its `sanitize`: a Unicode slash would stay in the id).
 */
export const featureLabelOf = (document: GherkinDocument, feature: string) => {
  const { keyword = "Feature", name = "" } = document.feature ?? {};
  const label = `${keyword}: ${name.trim() || path.basename(featureBase(feature))}`;
  return segmentOf(label);
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

/**
 * The export of a feature's own story (its id `…--vitest-cucumber-feature`), and its tags: out of
 * the sidebar, story tests, docs pages and component manifests (a feature file isn't a stories file).
 */
const featureStoryExport = "__vitestCucumberFeature";
const featureStoryTags = ["!dev", "!test", "!autodocs", "!manifest"];

/** A scenario's story, as the module exports it and Storybook indexes it. */
export interface ScenarioStory extends ScenarioLink {
  /** The module's export. */
  export: string;
  /** Its title: its test's place in Vitest's tree, below the feature's. */
  title: string;
  /**
   * Its tags: the story's own, the pickle's (Storybook's own among them without their `@`:
   * `./storybookTags.ts`), then `!autodocs` and `!manifest` (the meta's come with
   * the meta). Last, so they hold whatever the story it runs on is tagged: a scenario's story has
   * no docs page, and Storybook's manifests read a manifest entry's file as a stories file, which a
   * feature file isn't (a failure there loses every component's manifest).
   */
  storyTags: string[];
}

/**
 * The stories module of feature file `feature` (its Gherkin `document`, its Vitest `tree`), linked
 * to `storiesFile` (its `stories`, as Storybook reads them; its title, `storiesTitle`) by `links`;
 * `featureModule`, the feature module's id (its `playAt`); `idOf`, Storybook's `sanitize` (a
 * title's id). Its title: the stories file's, then the feature's label; each story's, its place
 * below it (`titles`, by export). Its meta: the stories file's (`metaOf`, its parameters among
 * it), its `id` the feature title's. A feature's text for docs: `featuresOf` (by its stories file:
 * `../../../worker/storybook/features.ts`), or Vite's `?raw` import of the file.
 */
export const featureStoriesOf = ({
  feature,
  document,
  tree,
  storiesFile,
  storiesTitle,
  stories,
  links,
  featureModule,
  idOf,
}: {
  feature: string;
  document: GherkinDocument;
  tree: FeatureSuite;
  storiesFile: string;
  storiesTitle: string;
  stories: StoriesOf;
  links: readonly ScenarioLink[];
  featureModule: string;
  idOf: (title: string) => string;
}) => {
  const label = featureLabelOf(document, feature);
  const title = `${storiesTitle}/${label}`;
  const exportNames = exportNamesOf(links);
  const places = placesOf(tree);
  const scenarios: ScenarioStory[] = links.map((link, index) => {
    const place = places.get(link.line);
    // A scenario's part of its title (an example has none: its title ends at its outline), and
    // its story's name: the same text, so the sidebar shows the story alone.
    const scenarioPart =
      place && !place.test.isExample ? segmentOf(place.test.name) : undefined;
    return {
      ...link,
      export: exportNames[index] ?? "",
      name: scenarioPart ?? place?.test.name ?? link.name,
      title: [
        title,
        ...(place?.suites ?? []).map(segmentOf),
        ...(scenarioPart === undefined ? [] : [scenarioPart]),
      ].join("/"),
      storyTags: [
        ...(link.exportName === undefined
          ? []
          : (stories.tags[link.exportName] ?? [])),
        ...storyTagsOf(link.tags),
        "!autodocs",
        "!manifest",
      ],
    };
  });
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
    `  id: ${json(idOf(title))},`,
    `  title: ${json(title)},`,
    `  tags: ${json(stories.metaTags)},`,
    "};",
    // The feature's own story, first: never listed, tested or documented, its title the feature's,
    // which Storybook gives a docs page attached to the feature (`<Meta of={…} />`: the title of
    // its file's first story), so the page is listed in the feature's folder.
    `export const ${featureStoryExport} = { tags: ${json(featureStoryTags)} };`,
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
          `  play: __cucumberFeature.playAt(${json({ line, unmounted })}),`,
          "};",
        ].join("\n"),
    ),
  ].join("\n");
  const titles = Object.fromEntries([
    [featureStoryExport, title],
    ...scenarios.map((scenario) => [scenario.export, scenario.title]),
  ]);
  return { code, title, scenarios, titles };
};
