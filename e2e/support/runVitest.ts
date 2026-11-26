// Runs Vitest once in a scenario's project: the run steps' (`../steps/vitest.ts`), and other steps'
// that run Vitest as part of what they check (the compatibility kit's: `compatibility/steps/`). The
// default config's runs without filters or options in its mode's kept Vitest (`./kept.ts`); any
// other in a new Vitest, closed after it, in the mode's run folder of this worker (`runDirFor`: its
// dependency caches warm). Both in this worker, a process per feature file (`isolate: true`): the
// native memory a closed Vitest leaves behind goes back to the system as the file ends.
import type { Envelope } from "@cucumber/messages";
import type { CliOptions } from "vitest/node";
import { checkPluginModules } from "./config.ts";
import { keptFor, runDirFor, runKept } from "./kept.ts";
import {
  collectGarbage,
  runResult,
  startSession,
  StartupError,
} from "./run.ts";
import { runAs } from "./storybookProject.ts";
import type { E2EWorld, RunResult } from "./world.ts";

/** Runs Vitest once, with Vitest's file `filters` and command line `options`. */
export async function runVitest(
  this: E2EWorld,
  options: { filters?: string[]; options?: CliOptions; fresh?: boolean } = {},
) {
  // A Storybook project's run: its feature files as stories (its run read as theirs).
  const asRun = await runAs.call(this);
  const entry =
    !options.fresh && !options.filters?.length && !options.options
      ? await keptFor.call(this)
      : undefined;
  // No feature file to run in a kept Vitest: a new Vitest reports it, as Vitest's command line does.
  const result =
    (entry && (await runKept(entry, this.dir, this.messages))) ||
    (await runOnce(
      await runDirFor(this.dir, this.mode, {
        files: this.files,
        cold: this.coldCaches,
      }),
      {
        ...options,
        messages: this.messages,
      },
    ));
  this.result = await asRun(result);
}

/**
 * A new Vitest's run in the project `dir` (see `startSession`), closed after it. One that can't
 * start is a failed run with no tests, its output the error's (`StartupError`), as Vitest's command
 * line exits.
 */
const runOnce = async (
  dir: string,
  options: { filters?: string[]; options?: CliOptions; messages?: Envelope[] },
): Promise<RunResult> => {
  const session = await startSession
    .call({ dir } as E2EWorld, options)
    .catch((error: unknown) => {
      if (error instanceof StartupError) {
        return error;
      }
      throw error;
    });
  if (session instanceof StartupError) {
    return {
      dir,
      exitCode: 1,
      output: session.output,
      modules: new Map(),
      tests: [],
    };
  }
  const { vitest, output, end } = session;
  try {
    const result = runResult(vitest, dir, { exitCode: 0, output: "" });
    checkPluginModules(vitest);
    await vitest.close();
    collectGarbage();
    return {
      ...result,
      exitCode: Number(process.exitCode ?? 0),
      output: output.text(),
    };
  } finally {
    end();
  }
};
