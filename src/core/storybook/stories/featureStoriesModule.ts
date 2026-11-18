// Storybook: the code of a feature file's stories module, as each host serves it, from the feature
// as made for Storybook (`./storybookPlan.ts`: its `stories`, or its `error`), one of two blocks: the
// module's code (`./featureStories.ts`), or the module that gives the error (`../../utils/errorCode.ts`: every
// line of it written here).
import type { FailedPlan } from "../../feature/plans.ts";
import { failingSuiteCode, throwCode } from "../../utils/errorCode.ts";
import type { StorybookPlan } from "./storybookPlans.ts";

/**
 * The code of a feature file's stories module in story tests, one of two blocks: its
 * `stories`' code; or, when it couldn't be made (`error`: its parse errors, its links), a suite whose body throws the error, so its file fails with it and no tests
 * (as the suite is collected, not as the module is imported, which Vitest's browser tester would
 * wrap: "Failed to import test file <path>"; the suite's name is never shown), and a meta (the
 * addon's transform reads the module as CSF, which needs one) with no story.
 */
export const storiesModule = (plan: StorybookPlan | FailedPlan) => {
  if ("error" in plan) {
    return [failingSuiteCode(plan.error), "export default {};"].join("\n");
  }
  return plan.stories.code;
};

/**
 * The code of a feature file's stories module in the preview, one of two blocks: its `stories`' code; or,
 * when it couldn't be made, its `error` thrown as the module is imported (Storybook's own index
 * stops on the feature first) and a meta with no story.
 */
export const storiesModulePreview = (plan: StorybookPlan | FailedPlan) => {
  if ("error" in plan) {
    return [throwCode(plan.error), "export default {};"].join("\n");
  }
  return plan.stories.code;
};
