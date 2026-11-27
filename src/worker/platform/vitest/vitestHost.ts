// A host in a Vitest worker or page (node mode's worker, browser mode's page, Storybook's story
// tests): its own pieces, and what every Vitest host shares: its cucumber worker id Vitest's pool id
// (`VITEST_POOL_ID`, on its `env`); from main's provided values
// (`../../../types/providedContext.ts`): the run's worker count, whether Vitest's output has colors,
// whether the run's messages are wanted (its stream has a subscriber: its command takes them),
// cucumber's default timeouts Vitest's (`./vitestTimeouts.ts`); and its command to main. Page-safe.
import { inject } from "vitest";
import type { Command } from "../../../types/commands.ts";
import type { Host } from "../../../types/platform.ts";
import type {} from "../../../types/providedContext.ts";
import type { ModeEnvironment } from "../../../types/runtimeEnvironment.ts";
import { vitestTimeouts } from "./vitestTimeouts.ts";

/** The host of `own` pieces, its runtime on `own.environment`, its command `own.command`. */
export const vitestHost = (
  own: Pick<Host, "env" | "importSupport" | "locate" | "throwable"> & {
    environment: () => ModeEnvironment;
    command: Command;
  },
): Host => {
  /** What main provides the worker or page (live: some values are each run's). */
  const provided = () => inject("vitestCucumber");
  return {
    ...own,
    // The worker id: Vitest's pool id, its slot among the project's workers or pages running at once (1
    // to `maxWorkers`; a worker keeps it for every file it runs, the next worker in its slot gets it
    // too), set on `process.env` in Node, on the page's `import.meta.env` (Vitest's tester, as it
    // runs a file).
    worker: () => ({
      workerId: String(own.env.VITEST_POOL_ID ?? 1),
      totalWorkers: provided().totalWorkers,
      projectName: provided().projectName,
    }),
    environment: () => ({
      ...own.environment(),
      defaultTimeouts: vitestTimeouts(),
    }),
    colors: () => provided().colors,
    // Its command, when the run's messages are sent (the run's stream has a subscriber).
    ...(provided().sendMessages && { messages: own.command }),
  };
};
