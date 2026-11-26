// `vitest list` as Vitest's command line runs it by default: the project's test files parsed, not
// run (Vitest's static collection, `parseSpecifications`: the transformed modules' `describe` and
// `…Test` calls, their names, tags and source-mapped locations), in a Vitest of its own, closed
// after. A feature's test module writes its tree as such calls (`../../src/core/feature/treeCalls.ts`:
// node and browser mode's feature module, a Storybook project's stories module). Or as
// `vitest list --staticParse=false` (`collectTests`): each test file imported in a worker or a
// page, its module declaring its tests, none of them run.
import path from "node:path";
import type { CliOptions } from "vitest/node";
import { createVitest } from "vitest/node";
import { relative } from "./paths.ts";
import { capture, viteLogger } from "./run.ts";
import { featureStoriesFiles } from "./storybookProject.ts";
import type { E2EWorld } from "./world.ts";

/**
 * Lists the scenario's tests, with Vitest's file filters (`file:line` too) and command line
 * options: its files parsed, or with `staticParse: false` imported (their tests collected).
 */
export async function listVitest(
  this: E2EWorld,
  {
    filters = [],
    options = {},
    staticParse = true,
  }: { filters?: string[]; options?: CliOptions; staticParse?: boolean },
) {
  // A Storybook project's: its feature files as stories (see `featureStoriesFiles`).
  if (this.mode === "storybook") {
    await featureStoriesFiles.call(this);
  }
  const output = capture();
  const { exitCode } = process;
  const vitest = await createVitest(
    { root: this.dir, watch: false, cache: false, ...options },
    { customLogger: viteLogger(output) },
    { stdout: output.stream, stderr: output.stream },
  );
  try {
    const specifications = await vitest.getRelevantTestSpecifications(
      filters.map((filter) => path.resolve(this.dir, filter)),
    );
    const { testModules: modules, unhandledErrors } = staticParse
      ? {
          testModules: await vitest.parseSpecifications(specifications),
          unhandledErrors: [],
        }
      : await vitest.collectTests(specifications);
    this.listed = {
      // What went wrong finding them: a file's own errors, and the errors outside any file.
      errors: [
        ...modules.flatMap((module) => module.errors()),
        ...unhandledErrors,
      ].map((error) =>
        error instanceof Error ||
        (typeof error === "object" && error !== null && "message" in error)
          ? String(error.message)
          : String(error),
      ),
      tests: modules.flatMap((module) =>
        // As the command prints them: a test a filter leaves out (a `file:line`, a tag) is skipped.
        [...module.children.allTests()]
          .filter((test) => test.result().state !== "skipped")
          .map((test) => ({
            name: test.fullName,
            location: test.location
              ? `${relative(this.dir, module.moduleId)}:${String(test.location.line)}:${String(test.location.column)}`
              : "",
          })),
      ),
      output: output.text(),
    };
  } finally {
    await vitest.close();
    process.exitCode = exitCode;
  }
}
