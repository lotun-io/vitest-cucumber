// Storybook, watch mode: the feature files a file's event leaves out of date. A feature's stories
// module is made from its stories file and the support files' Storybook steps too, which Vite,
// Vitest and Storybook don't know: the plans (`./storybookPlans.ts`'s `onFileChange`) have the
// host take these features as changed (their modules made again, their index entries too). Looked up in the stories links (`./storiesLinks.ts`), no feature
// linked again:
// - the Storybook steps' expressions are others: every Storybook feature (any may link another way);
// - a stories file changed, added or deleted: the features that run on it;
// - a stories file added or deleted: also the feature next to it by its name (it runs on it
//   now, or did);
// - a stories file added: also the features with no stories file (a stories file step of
//   theirs may name it: only a file that exists is linked).
// Any other file: none.
import { isStoriesFile, siblingFeaturesOf } from "./featureLinks.ts";
import type { StoriesLinks } from "./storiesLinks.ts";

export const staleFeaturesOf = ({
  type,
  file,
  links,
  stepsChanged,
}: {
  /** The event, and its file (with `/`). */
  type: "add" | "change" | "unlink";
  file: string;
  /** Which Storybook feature runs on which stories file. */
  links: Pick<StoriesLinks, "features" | "featuresOf" | "has">;
  /** Whether the Storybook steps' expressions are others than the last read. */
  stepsChanged: boolean;
}): string[] => {
  if (stepsChanged) {
    return links.features();
  }
  const stale = new Set(links.featuresOf(file));
  if (type !== "change" && isStoriesFile(file)) {
    for (const feature of siblingFeaturesOf(file).filter(links.has)) {
      stale.add(feature);
    }
    if (type === "add") {
      for (const feature of links.featuresOf(undefined)) {
        stale.add(feature);
      }
    }
  }
  return [...stale];
};
