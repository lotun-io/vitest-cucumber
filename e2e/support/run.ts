// One run of Vitest in a scenario's project, as `vitest` in its directory would run it: its output
// recorded, its result read from its state (see `RunResult`).
import type { Envelope } from "@cucumber/messages";
import { readFileSync } from "node:fs";
import path from "node:path";
import { Writable } from "node:stream";
import { inspect } from "node:util";
import type { CliOptions, TestSpecification, Vitest } from "vitest/node";
import { startVitest } from "vitest/node";
import { collectingReporter } from "./messages.ts";
import { relative } from "./paths.ts";
import type { E2EWorld, RunResult } from "./world.ts";

/**
 * Collects this process' garbage now, if Node exposes `gc` (`--expose-gc`): after a Vitest closes,
 * the native memory its objects hold (its bundler's, parsers') is freed only as V8 collects them,
 * which a worker with room in its heap may not do for long.
 */
export const collectGarbage = () => {
  (globalThis as { gc?: () => void }).gc?.();
};

/** A stream recording what's written to it. */
export const capture = () => {
  let text = "";
  const stream = new Writable({
    write(chunk, _encoding, callback) {
      text += String(chunk);
      callback();
    },
  });
  return {
    stream,
    text: () => text,
    clear: () => {
      text = "";
    },
  };
};

/**
 * The last rejection no one handled in this process. Recorded before any nested Vitest's logger sees
 * it: each open Vitest (the kept ones too) prints it to its own output, then exits, and the first to
 * exit may not be the scenario's.
 */
let lastRejection: unknown;
process.prependListener("unhandledRejection", (reason) => {
  lastRejection = reason;
});

/**
 * While a nested Vitest runs, its `process.exit` (its logger's, on an unhandled rejection in this
 * process) fails the step with the rejection and what the run printed, not just Vitest's guard's
 * `process.exit unexpectedly called`. Returns the restore.
 */
export const showExit = (output: ReturnType<typeof capture>) => {
  const { exit } = process;
  lastRejection = undefined;
  process.exit = ((code?: number) => {
    const rejection =
      lastRejection === undefined
        ? ""
        : `\nThe unhandled rejection: ${inspect(lastRejection)}`;
    throw new Error(
      `The nested Vitest called process.exit(${String(code ?? process.exitCode)}).${rejection}\nIts output:\n${output.text()}`,
    );
  }) as typeof process.exit;
  return () => {
    process.exit = exit;
  };
};

/**
 * What a run of Vitest reported (see `RunResult`), from its state now: of `specifications` only, if
 * given (a kept Vitest's state has its earlier runs' too, and its other project's).
 */
export const runResult = (
  vitest: Vitest,
  dir: string,
  { exitCode, output }: Pick<RunResult, "exitCode" | "output">,
  specifications?: readonly Pick<TestSpecification, "moduleId" | "project">[],
): RunResult => {
  const modules = vitest.state
    .getTestModules()
    .filter(
      (module) =>
        !specifications ||
        specifications.some(
          ({ moduleId, project }) =>
            moduleId === module.moduleId && project === module.project,
        ),
    );
  return {
    dir,
    exitCode,
    output,
    modules: new Map(
      modules.map((module) => [relative(dir, module.moduleId), module.state()]),
    ),
    tests: modules.flatMap((module) =>
      [...module.children.allTests()].map((test) => {
        const result = test.result();
        return {
          module: relative(dir, module.moduleId),
          name: test.fullName,
          ownName: test.name,
          state: result.state,
          errors: (result.errors ?? []).map(({ message }) => message),
          stacks: (result.errors ?? []).map(({ stacks }) => stacks ?? []),
          retryCount: test.diagnostic()?.retryCount ?? 0,
          ran: test.options.mode !== "skip" && test.options.mode !== "todo",
          annotations: test
            .annotations()
            .map(({ type, message, attachment }) => ({
              type,
              message,
              ...(attachment?.contentType !== undefined && {
                contentType: attachment.contentType,
              }),
            })),
          contents: test
            .annotations()
            .map(({ attachment }) =>
              attachment === undefined
                ? undefined
                : attachment.path !== undefined
                  ? readFileSync(path.resolve(dir, attachment.path)).toString(
                      "base64",
                    )
                  : attachment.bodyEncoding === "utf-8"
                    ? Buffer.from(String(attachment.body)).toString("base64")
                    : String(attachment.body),
            ),
          ...(result.state === "skipped" &&
            result.note !== undefined && { note: result.note }),
        };
      }),
    ),
  };
};

/**
 * Starts Vitest in the scenario's project, as `vitest [filters]` in its directory would, with
 * Vitest's command line options (`root` from the scenario's project), its runs' messages into
 * `messages` if given (`./messages.ts`: a reporter of its own); its output is recorded until `end`, which restores this
 * process.
 */
/**
 * Vitest couldn't start (its config failed to load, a project to be set up): its output, then the
 * error as Vitest's command line prints it ("Startup Error", then `console.error`'s inspection).
 */
export class StartupError extends Error {
  readonly output: string;
  constructor(output: string, cause: unknown) {
    super(cause instanceof Error ? cause.message : String(cause), { cause });
    this.output = `${output}\nStartup Error\n${inspect(cause)}\n`;
  }
}

export async function startSession(
  this: E2EWorld,
  {
    filters = [],
    options = {},
    messages,
  }: { filters?: string[]; options?: CliOptions; messages?: Envelope[] },
) {
  const output = capture();
  // Vitest reports its result as the process' exit code: this process' (see `end`).
  const { exitCode } = process;
  process.exitCode = undefined;
  const restoreExit = showExit(output);
  const end = () => {
    restoreExit();
    process.exitCode = exitCode;
  };
  // The command line as `vitest [filters]` gives it (the plugin reads a named feature file from it).
  const argv = process.argv;
  process.argv = [
    argv[0] ?? "node",
    "vitest",
    ...filters.map((filter) => path.resolve(this.dir, filter)),
  ];
  try {
    const vitest = await startVitest(
      // Vitest finds `file:line` filters from the working directory.
      filters.map((filter) => path.resolve(this.dir, filter)),
      {
        root: this.dir,
        watch: false,
        // No results kept between runs (they order the files: failed and slower ones first): the
        // project's folder is reused (`./kept.ts`), each run's order as in a new project.
        cache: false,
        // Every console log, the passing tests' too: scenarios log what they check.
        silent: false,
        // As Vitest's command line does for `file:line` filters.
        includeTaskLocation: filters.some((filter) => /:\d+$/.test(filter)),
        ...options,
        // Its messages' collector, with Vitest's default reporter (a config's own replaced: none of
        // the scenarios collecting messages has one).
        ...(messages && {
          reporters: [
            ...[options.reporters ?? "default"].flat(),
            collectingReporter(messages),
          ] as CliOptions["reporters"],
        }),
        ...(options.root && { root: path.resolve(this.dir, options.root) }),
      },
      {},
      { stdout: output.stream, stderr: output.stream },
    );
    return { vitest, output, end };
  } catch (error) {
    end();
    throw new StartupError(output.text(), error);
  } finally {
    process.argv = argv;
  }
}
