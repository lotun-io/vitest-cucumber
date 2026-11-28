// Storybook: which story each scenario of a feature file runs on, from its Storybook steps
// (`./storybookSteps.ts`; `notes/storybook.md`, "Scenarios as tests of stories"); the user's calls,
// 2026-11-27: nothing taken for granted (no stories file found next to the feature, no story
// meaning the meta). Each scenario (or Outline row: a pickle, its Backgrounds' steps included)
// names its stories file and its story, once each. A feature file has one stories file step, so
// it's written in its Background (it reaches each scenario), naming its stories file from the
// project's root, or from the feature file's folder with `./` or `../`: a feature runs on one (its
// module, which Storybook indexes and tests, has one meta: the stories file's). The story is one of
// the stories file's, or `default` (no story can be named so), its meta (its component, args,
// decorators), mounted or not; scenarios may name others. A scenario without steps of its own gets
// no Background steps, so it names neither: an error.
// What can be checked from the feature file and the file system is checked here (the export, against
// the stories file's stories: `./linkedFeature.ts`).
import type { GherkinDocument, Pickle } from "@cucumber/messages";
import { existsSync } from "node:fs";
import path from "node:path";
import type { Located } from "../../../utils/errors.ts";
import { slash } from "../../../utils/slash.ts";
import type { StepLink, StorybookSteps } from "./storybookSteps.ts";

/** A scenario (or an Outline row) that runs on a story. */
export interface ScenarioLink {
  /** The pickle's line (a scenario's, or an Outline row's). */
  line: number;
  name: string;
  /** The pickle's tags. */
  tags: string[];
  /** The story's export, or none: the meta (the story `default`). */
  exportName?: string;
  /** Whether the scenario mounts the story itself. */
  unmounted: boolean;
  /** The story step's line (the error messages'). */
  storyLine: number;
}

/** The story a Storybook step names for the meta (its export: no story can be named so). */
const metaStory = "default";

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
 * `pickles`) that run on a story, by `steps`, and the errors in their links: its stories file (one
 * that exists; `named`, the one it names, whether it exists or not: what a watcher's event on it
 * concerns), the line naming it, each scenario's story.
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
  const errors: Located[] = [];
  const lines = stepLines(document);
  /** A place in the feature file: its line. */
  const placeOf = (line: number) => `${uri}:${String(line)}`;
  /** The stories file steps, by line (an Outline's step: each row's file). */
  const storiesSteps = new Map<number, Set<string>>();
  /** Each pickle's story step. */
  const linked: {
    pickle: Pickle;
    line: number;
    storyStep: StepLink & { line: number };
  }[] = [];
  /** The pickles that miss the stories file step, the story step or both (their messages after). */
  const lacking: {
    scenario: string;
    line: number;
    stories: boolean;
    story: boolean;
    steps: boolean;
  }[] = [];
  for (const pickle of pickles) {
    const line = pickle.location?.line ?? 0;
    const scenario = `the scenario "${pickle.name}"`;
    const story: (StepLink & { line: number })[] = [];
    let named = false;
    let ambiguous = false;
    for (const step of pickle.steps) {
      const stepLine = lines.get(step.astNodeIds[0] ?? "") ?? line;
      const matches = steps.match(step.text);
      if (matches.length > 1) {
        errors.push({
          message: `"${step.text}" matches ${String(matches.length)} Storybook steps`,
          at: [...matches.map(({ at }) => at), placeOf(stepLine)],
        });
        ambiguous = true;
        continue;
      }
      const [match] = matches;
      if (match?.exportName !== undefined) {
        story.push({ ...match, line: stepLine });
      }
      if (match?.storiesFile !== undefined) {
        named = true;
        const files = storiesSteps.get(stepLine) ?? new Set();
        storiesSteps.set(stepLine, files.add(match.storiesFile));
      }
    }
    if (ambiguous) {
      continue;
    }
    const [storyStep] = story;
    if (story.length > 1) {
      errors.push({
        message: `${scenario} names a story twice: a scenario has one, its Backgrounds' steps included`,
        at: [...story.map(({ line: at }) => placeOf(at)), placeOf(line)],
      });
    }
    if (!named || !storyStep) {
      lacking.push({
        scenario,
        line,
        stories: !named,
        story: !storyStep,
        steps: pickle.steps.length > 0,
      });
    } else if (story.length === 1) {
      linked.push({ pickle, line, storyStep });
    }
  }
  // A scenario that doesn't name both (without any stories file step: the feature's error, below).
  for (const { scenario, line, stories, story, steps: hasSteps } of lacking) {
    const what = [
      ...(stories && storiesSteps.size > 0 ? ["stories file"] : []),
      ...(story ? ["story"] : []),
    ];
    const why = hasSteps
      ? [
          ...(what.includes("stories file")
            ? [
                "the feature's stories file step reaches each scenario in its Background",
              ]
            : []),
          ...(story
            ? [
                `a story step names its story (its stories file's, or "${metaStory}": its meta)`,
              ]
            : []),
        ]
      : [
          "it has no steps (a Background's steps reach only a scenario with steps of its own)",
        ];
    if (what.length > 0) {
      errors.push({
        message: `${scenario} names no ${what.join(" and no ")}: ${why.join("; ")}`,
        at: [placeOf(line)],
      });
    }
  }
  // Its stories file: one step naming it, once.
  const named =
    pickles.length === 0
      ? // No scenario: no pickle has the Background's steps, none names a stories file.
        {
          error: {
            message:
              "the feature has no scenarios: in Storybook, a feature's scenarios are its stories",
            at: [placeOf(document.feature?.location.line ?? 1)],
          },
        }
      : storiesFileOf({
          feature,
          uri,
          root,
          featureLine: document.feature?.location.line ?? 1,
          storiesSteps,
        });
  if ("error" in named) {
    errors.push(named.error);
    return {
      named: undefined,
      storiesFile: undefined,
      storiesLine: undefined,
      links: [],
      errors,
    };
  }
  const exists = existsSync(named.file);
  if (!exists) {
    errors.push({
      message: `the stories file "${named.written}" doesn't exist (${slash(path.relative(root, named.file))}, from ${named.relative ? "the feature file's folder" : "the project's root"})`,
      at: [placeOf(named.line)],
    });
  }
  const storiesFile = exists ? named.file : undefined;
  const links: ScenarioLink[] = storiesFile
    ? linked.map(({ pickle, line, storyStep }) => ({
        line,
        name: pickle.name,
        tags: pickle.tags.map(({ name }) => name),
        unmounted: storyStep.unmounted,
        storyLine: storyStep.line,
        ...(storyStep.exportName !== undefined &&
          storyStep.exportName !== metaStory && {
            exportName: storyStep.exportName,
          }),
      }))
    : [];
  return {
    named: named.file,
    storiesFile,
    storiesLine: named.line,
    links,
    errors,
  };
};

/**
 * The stories file of feature file `feature` (`uri`, from `root`) its stories file steps name
 * (`storiesSteps`: each step's line, the files it names), resolved; or why it has none: no step,
 * two, one naming two (an Outline's rows), a path that starts with `/`.
 */
const storiesFileOf = ({
  feature,
  uri,
  root,
  featureLine,
  storiesSteps,
}: {
  feature: string;
  uri: string;
  root: string;
  /** The `Feature:` line. */
  featureLine: number;
  storiesSteps: ReadonlyMap<number, ReadonlySet<string>>;
}):
  | { file: string; written: string; line: number; relative: boolean }
  | { error: Located } => {
  /** A place in the feature file: its line. */
  const placeOf = (line: number) => `${uri}:${String(line)}`;
  const once = "a feature file names its stories file once, in its Background";
  if (storiesSteps.size === 0) {
    return {
      error: {
        message: `the feature names no stories file: ${once}, with a stories file step`,
        at: [placeOf(featureLine)],
      },
    };
  }
  const found = [...storiesSteps].sort(([a], [b]) => a - b);
  if (found.length > 1) {
    return {
      error: {
        message: `the feature has ${String(found.length)} stories file steps: ${once}`,
        at: found.map(([line]) => placeOf(line)),
      },
    };
  }
  const [[line, files] = [0, new Set<string>()]] = found;
  const [written = "", ...more] = files;
  if (more.length > 0) {
    return {
      error: {
        message: `the stories file step names ${String(files.size)} stories files (${[...files].join(", ")}): a feature file runs on one stories file, split it into one per stories file`,
        at: [placeOf(line)],
      },
    };
  }
  if (written.startsWith("/")) {
    return {
      error: {
        message: `the stories file "${written}" starts with "/": write it from the project's root, or from the feature file's folder with "./" or "../"`,
        at: [placeOf(line)],
      },
    };
  }
  const relative = written.startsWith("./") || written.startsWith("../");
  const file = path.resolve(relative ? path.dirname(feature) : root, written);
  return { file, written, line, relative };
};

/** A feature file linked by the Storybook steps (`featureLinksOf`'s): its stories file, each scenario's story, its links' errors. */
export type FeatureLinks = ReturnType<typeof featureLinksOf>;
