// Storybook: which story each scenario of a feature file runs on, from its Storybook steps
// (`./storybookSteps.ts`; `notes/storybook.md`, "Scenarios as tests of stories"). A feature file runs on
// one stories file (its module, which Storybook indexes and tests, has one meta: the stories file's):
// the one its stories file steps name (from the project's root, or from the feature file's folder
// with `./` or `../`; usually once, in its Background), else the one next to it; with neither, its
// scenarios aren't Storybook's. Every scenario of the feature runs on it, also one its stories file
// step doesn't reach (a scenario without steps of its own gets no Background steps). Per pickle (a
// scenario, or an Outline row, its Backgrounds' steps included), a Storybook step names its export (and
// whether it's unmounted); without one, or one naming `default` (the meta's export: an Outline's rows
// on stories and on the meta), the stories file's meta (its component, args, decorators). A scenario
// has at most one of each.
// What can be checked from the feature file and the file system is checked here (the export, against
// the stories file's stories: `./linkedFeature.ts`).
import type { GherkinDocument, Pickle } from "@cucumber/messages";
import { existsSync } from "node:fs";
import path from "node:path";
import { slash } from "../../../utils/slash.ts";
import { featureBase } from "../../feature/featureFile.ts";
import { storiesExtensions } from "./featureStories.ts";
import type { StepLink, StorybookSteps } from "./storybookSteps.ts";

/** A scenario (or an Outline row) that runs on a story. */
export interface ScenarioLink {
  /** The feature file's path. */
  feature: string;
  /** The pickle's line (a scenario's, or an Outline row's). */
  line: number;
  name: string;
  /** The pickle's tags. */
  tags: string[];
  /** The stories file's path. */
  storiesFile: string;
  /** The story's export, or none: the meta. */
  exportName?: string;
  /** Whether the scenario mounts the story itself. */
  unmounted: boolean;
  /** The Storybook step's line, if any (the error messages'). */
  storyLine?: number;
}

/** The story a Storybook step names for the meta (its export: no story can be named so). */
export const metaStory = "default";

/** A stories file's name: its base, then `.stories.` and a script extension. */
const storiesSuffix = new RegExp(
  String.raw`\.stories\.(?:${storiesExtensions.join("|")})$`,
);

/** Whether `file` is a stories file, by its name. */
export const isStoriesFile = (file: string) => storiesSuffix.test(file);

/**
 * The names a feature file next to stories file `file` may have (`Button.stories.tsx` →
 * `Button.feature`, `Button.feature.md`: `featureBase`'s): the feature that runs on it unless a
 * stories file step names another.
 */
export const siblingFeaturesOf = (file: string) => {
  const base = file.replace(storiesSuffix, "");
  return [".feature", ".feature.md"].map((extension) => `${base}${extension}`);
};

/** The stories file next to `feature` (`Button.feature` → `Button.stories.tsx`), if any. */
export const siblingStoriesOf = (feature: string) =>
  storiesExtensions
    .map((extension) => `${featureBase(feature)}.stories.${extension}`)
    .find((file) => existsSync(file));

/** Each step's line in `document`, by its id (Backgrounds', scenarios', rules'). */
const stepLines = (document: GherkinDocument) => {
  const lines = new Map<string, number>();
  const add = (
    steps: readonly { id: string; location: { line: number } }[],
  ) => {
    for (const { id, location } of steps) {
      lines.set(id, location.line);
    }
  };
  for (const child of document.feature?.children ?? []) {
    add(child.background?.steps ?? []);
    add(child.scenario?.steps ?? []);
    for (const ruleChild of child.rule?.children ?? []) {
      add(ruleChild.background?.steps ?? []);
      add(ruleChild.scenario?.steps ?? []);
    }
  }
  return lines;
};

/**
 * The scenarios of feature file `feature` (`uri`, its path from `root`; its Gherkin `document` and
 * `pickles`) that run on a story, by `steps`, and the errors in their links.
 */
export const featureLinksOf = ({
  feature,
  uri,
  root,
  document,
  pickles,
  steps,
}: {
  feature: string;
  uri: string;
  root: string;
  document: GherkinDocument;
  pickles: readonly Pickle[];
  steps: StorybookSteps;
}) => {
  const errors: string[] = [];
  const lines = stepLines(document);
  /** Each pickle's Storybook step, and the stories file its stories file step names (resolved). */
  const linked: {
    pickle: Pickle;
    line: number;
    storybookStep?: StepLink & { line: number };
    named?: { file: string; line: number };
  }[] = [];
  for (const pickle of pickles) {
    const line = pickle.location?.line ?? 0;
    const story: (StepLink & { line: number })[] = [];
    const stories: (StepLink & { line: number })[] = [];
    for (const step of pickle.steps) {
      const stepLine = lines.get(step.astNodeIds[0] ?? "") ?? line;
      const matches = steps.match(step.text);
      if (matches.length > 1) {
        errors.push(
          `${uri}:${String(stepLine)}: "${step.text}" matches ${String(matches.length)} Storybook steps (${matches.map(({ at }) => at).join(", ")})`,
        );
        continue;
      }
      const [match] = matches;
      if (match?.exportName !== undefined) {
        story.push({ ...match, line: stepLine });
      }
      if (match?.storiesFile !== undefined) {
        stories.push({ ...match, line: stepLine });
      }
    }
    const scenario = `${uri}:${String(line)} ("${pickle.name}")`;
    const twice = (what: string, found: { line: number }[]) =>
      `${scenario} names ${what} twice (lines ${found.map(({ line: at }) => String(at)).join(" and ")}): a scenario has one, its Backgrounds' steps included`;
    if (story.length > 1) {
      errors.push(twice("a story", story));
      continue;
    }
    if (stories.length > 1) {
      errors.push(twice("a stories file", stories));
      continue;
    }
    const [storybookStep] = story;
    const [storiesStep] = stories;
    let named: { file: string; line: number } | undefined;
    if (storiesStep?.storiesFile !== undefined) {
      const written = storiesStep.storiesFile;
      if (written.startsWith("/")) {
        errors.push(
          `${uri}:${String(storiesStep.line)}: the stories file "${written}" starts with "/": write it from the project's root, or from the feature file's folder with "./" or "../"`,
        );
        continue;
      }
      const relative = written.startsWith("./") || written.startsWith("../");
      const file = path.resolve(
        relative ? path.dirname(feature) : root,
        written,
      );
      if (!existsSync(file)) {
        errors.push(
          `${uri}:${String(storiesStep.line)}: the stories file "${written}" doesn't exist (${file}, from ${relative ? "the feature file's folder" : "the project's root"})`,
        );
        continue;
      }
      named = { file, line: storiesStep.line };
    }
    linked.push({ pickle, line, storybookStep, named });
  }
  // One stories file per feature file: the feature's module has one meta, its stories file's.
  const files = [
    ...new Set(linked.flatMap(({ named }) => (named ? [named.file] : []))),
  ];
  if (files.length > 1) {
    errors.push(
      `${uri} names ${String(files.length)} stories files (${files
        .map(
          (file) =>
            `${slash(path.relative(root, file))}: line ${[
              ...new Set(
                linked.flatMap(({ named }) =>
                  named?.file === file ? [String(named.line)] : [],
                ),
              ),
            ].join(", ")}`,
        )
        .join(
          "; ",
        )}): a feature file runs on one stories file, split it into one per stories file`,
    );
    return {
      storiesFile: undefined,
      storiesLine: undefined,
      links: [],
      errors,
    };
  }
  const storiesFile = files[0] ?? siblingStoriesOf(feature);
  const links: ScenarioLink[] = [];
  for (const { pickle, line, storybookStep } of linked) {
    const scenario = `${uri}:${String(line)} ("${pickle.name}")`;
    if (!storiesFile) {
      if (storybookStep) {
        errors.push(
          `${scenario} names the story "${storybookStep.exportName ?? ""}" (line ${String(storybookStep.line)}), but has no stories file: none is next to the feature file, add a stories file step`,
        );
      }
      continue;
    }
    links.push({
      feature,
      line,
      name: pickle.name,
      tags: pickle.tags.map(({ name }) => name),
      storiesFile,
      unmounted: storybookStep?.unmounted ?? false,
      ...(storybookStep?.exportName !== undefined &&
        storybookStep.exportName !== metaStory && {
          exportName: storybookStep.exportName,
          storyLine: storybookStep.line,
        }),
    });
  }
  // The line of the stories file step naming it (the first; none: the one next to the feature).
  const storiesLine = linked.find(({ named }) => named)?.named?.line;
  return { storiesFile, storiesLine, links, errors };
};

/** A feature file linked by the Storybook steps (`featureLinksOf`'s): its stories file, each scenario's story, its links' errors. */
export type FeatureLinks = ReturnType<typeof featureLinksOf>;
