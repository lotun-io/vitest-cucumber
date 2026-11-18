// Main's answers to the commands (`../../types/commands.ts`), whichever transport brought them: a
// page's browser command (`./browserCommand.ts`) or a node worker's TCP connection
// (`./server.ts`). `messages`: a batch
// of the run's Cucumber Messages, for its stream (both Vitest's test runs': `../runs/testRuns.ts`);
// `locate`: where a page's support code's calls were made (`./locate.ts`).
import type { TestProject } from "vitest/node";
import type { Actions } from "../../types/commands.ts";
import { pluginError } from "../../utils/errors.ts";
import { type TestRuns, testRunsOf } from "../runs/testRuns.ts";
import { locate } from "./locate.ts";

/**
 * Main's actions, in the project at `cwd`, on the asking project's Vitest's `testRuns` (its runs and
 * messages; the plugin keeps none: `../plugin/vitestState.ts`).
 */
export const createActions = ({
  cwd,
  testRuns = (project) => testRunsOf(project.vitest),
}: {
  cwd: () => string;
  testRuns?: (project: TestProject) => TestRuns;
}) => ({
  /** `action`'s answer for a caller of `project`; a failure fails its command. */
  answer: (
    project: TestProject,
    action: keyof Actions,
    options: never,
  ): unknown => {
    switch (action) {
      case "locate":
        return locate(project, cwd(), options);
      case "messages":
        testRuns(project).receive((options as Actions["messages"][0]).batch);
        return null;
      default:
        throw pluginError(`no action "${String(action)}"`, { internal: true });
    }
  },
});
