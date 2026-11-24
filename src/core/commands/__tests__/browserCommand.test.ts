import { expect, test } from "vitest";
import type { TestProject } from "vitest/node";
import type { MessageBatch } from "../../../types/messages.ts";
import { createTestRuns } from "../../runs/testRuns.ts";
import { ownModule } from "../../utils/ownModule.ts";
import { createActions } from "../actions.ts";
import { browserCommands } from "../browserCommand.ts";

/** A project of 3 workers, whose browser maps each stack's frames as `frames` says. */
const projectOf = (
  frames: Record<string, { file: string; line: number; column: number }[]> = {},
) =>
  ({
    config: { maxWorkers: 3 },
    browser: { parseStacktrace: (stack: string) => frames[stack] ?? [] },
  }) as unknown as TestProject;

// Main's actions, through the browser command (a node worker's TCP server uses the same actions).
const setup = (project = projectOf()) => {
  const batches: MessageBatch[] = [];
  const runs = createTestRuns({ watch: false });
  runs.receive = (batch) => {
    batches.push(batch);
  };
  const actions = createActions({
    cwd: () => "/project",
    testRuns: () => runs,
  });
  const { vitestCucumber } = browserCommands(actions);
  /** Calls the command as a page of `project`. */
  const call = (action: string, options: unknown = {}) =>
    vitestCucumber({ project } as never, action as never, options as never);
  return { call, runs, batches };
};

test("locate: each stack's first frame that isn't the plugin's, its path from the root", async () => {
  // A frame of the plugin's own (the page's stand-in, where the support code calls it).
  const plugin = {
    file: ownModule("worker/cucumber/page"),
    line: 9,
    column: 1,
  };
  const { call } = setup(
    projectOf({
      definition: [
        plugin,
        { file: "/project/features/steps.ts", line: 4, column: 1 },
      ],
      internal: [plugin],
    }),
  );
  expect(
    await call("locate", { stacks: ["definition", "internal", undefined] }),
  ).toEqual([
    { uri: "features/steps.ts", line: 4, column: 1 },
    undefined,
    undefined,
  ]);
});

test("an action main doesn't have: the command fails with the plugin's error", async () => {
  const { call } = setup();
  await expect(call("describe")).rejects.toThrow(
    '[@lotun/vitest-cucumber] no action "describe"',
  );
});

test("messages: each batch received, for the run's stream; no answer", async () => {
  const { call, batches } = setup();
  const batch = { support: true, envelopes: [] };
  expect(await call("messages", { batch })).toBeNull();
  expect(batches).toEqual([batch]);
});
