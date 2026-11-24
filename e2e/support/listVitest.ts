// `vitest list` as Vitest's command line runs it by default: the project's test files parsed, not
// run (Vitest's static collection, `parseSpecifications`: the transformed modules' `describe` and
// `…Test` calls, their names, tags and source-mapped locations), in a Vitest of its own, closed
// after. A feature module writes its tree as such calls (`../../src/core/feature/featureModule.ts`).
import path from "node:path";
import type { CliOptions } from "vitest/node";
import { createVitest } from "vitest/node";
import { relative } from "./paths.ts";
import { capture, viteLogger } from "./run.ts";
import type { E2EWorld } from "./world.ts";

/** Lists the scenario's tests, with Vitest's file filters (`file:line` too) and command line options. */
export async function listVitest(
  this: E2EWorld,
  { filters = [], options = {} }: { filters?: string[]; options?: CliOptions },
) {
  const output = capture();
  const { exitCode } = process;
  const vitest = await createVitest(
    "test",
    { root: this.dir, watch: false, cache: false, ...options },
    { customLogger: viteLogger(output) },
    { stdout: output.stream, stderr: output.stream },
  );
  try {
    const specifications = await vitest.getRelevantTestSpecifications(
      filters.map((filter) => path.resolve(this.dir, filter)),
    );
    const modules = await vitest.parseSpecifications(specifications);
    this.listed = {
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
