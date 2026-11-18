// Storybook: a feature file, linked to its stories file (`notes/storybook.md`, "The feature file as
// the CSF module"): its scenarios linked (`./featureLinks.ts`, by the support files' Storybook
// steps: `./supportSteps.ts`), each linked story checked here against the stories file's stories
// as Storybook reads them (`./storiesFile.ts`: CSF 3 only, CSF factories not yet supported). The feature's
// module (its scenarios as stories, its stories file's meta) is made from this; the errors are the
// feature file's.
import path from "node:path";
import { slash } from "../../../utils/slash.ts";
import type { FeatureLinks } from "./featureLinks.ts";
import { type StoriesOf, storiesOfFile } from "./storiesFile.ts";

/**
 * A linked feature file (`uri`, its path from `root`; `linked`, its links: `./featureLinks.ts`'s,
 * with the Storybook steps' own errors, `stepErrors`), checked against its stories file's stories
 * as Storybook reads them (`storiesOf`): its stories file, if any (else it's not a Storybook
 * feature), its stories, the scenarios that run on them, and every error in its links.
 */
export const linkedFeatureOf = async ({
  uri,
  root,
  linked,
  stepErrors,
  storiesOf = storiesOfFile,
}: {
  uri: string;
  root: string;
  linked: FeatureLinks;
  stepErrors: readonly string[];
  storiesOf?: (file: string) => Promise<StoriesOf>;
}) => {
  const errors = [...stepErrors, ...linked.errors];
  const { storiesFile } = linked;
  if (!storiesFile) {
    return { links: linked.links, errors };
  }
  const storiesUri = slash(path.relative(root, storiesFile));
  // A file that isn't a stories file (a step naming a component, a folder), or a broken one: the
  // feature's error, not the reader's own (Storybook's parser's, Node's: no feature named).
  let stories;
  try {
    // With `/`: a reader writes the path it's given into its error (Storybook's parser, Node).
    stories = await storiesOf(slash(storiesFile));
  } catch (error) {
    // Its first line, its paths from the root (Storybook's parser and Node write them in full).
    const [reason = ""] = (
      error instanceof Error ? error.message : String(error)
    )
      .replaceAll(`${root}${path.sep}`, "")
      .replaceAll(`${slash(root)}/`, "")
      .split("\n");
    errors.push(
      `${uri}${linked.storiesLine === undefined ? "" : `:${String(linked.storiesLine)}`}: ${storiesUri} can't be read as a stories file (${reason})`,
    );
    return { storiesFile, links: [], errors };
  }
  if (stories.factories) {
    errors.push(
      `${storiesUri} uses CSF factories, which the plugin doesn't support yet: ${uri}'s scenarios need its stories in CSF 3`,
    );
    return { storiesFile, links: [], errors };
  }
  const known = new Set(stories.exports);
  for (const { exportName, storyLine, line } of linked.links) {
    if (exportName !== undefined && !known.has(exportName)) {
      errors.push(
        `${uri}:${String(storyLine ?? line)}: ${storiesUri} has no story "${exportName}" (its stories: ${stories.exports.join(", ") || "none"})`,
      );
    }
  }
  return {
    storiesFile,
    stories,
    links: linked.links.filter(
      ({ exportName }) => exportName === undefined || known.has(exportName),
    ),
    errors,
  };
};
