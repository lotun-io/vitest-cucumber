// What a feature file is (`.feature`, `.feature.md`), and which one a project's test file runs: a
// feature file itself (in a Storybook project too: its stories module, `../storybook/stories/featureStories.ts`).
import { withoutQuery } from "../utils/withoutQuery.ts";

const featureExtension = /\.feature(\.md)?$/;

/** Whether `id` is a feature file. */
export const isFeatureFile = (id: string) => featureExtension.test(id);

/**
 * `file` without its feature extension (`Login.feature`, `Login.feature.md` → `Login`): its
 * sibling stories file's base, in Storybook. Only that: `Login.stories.feature` is `Login.stories`,
 * a feature with no stories file next to it (a stories file step names its one).
 */
export const featureBase = (file: string) => file.replace(featureExtension, "");

/** The feature file a test file runs (`file`, a path or a module id): itself, if it's one. */
export const featureOfTestFile = (file: string) => {
  const own = withoutQuery(file);
  return isFeatureFile(own) ? own : undefined;
};
