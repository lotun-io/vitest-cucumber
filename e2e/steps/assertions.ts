import type { DataTable } from "@cucumber/cucumber";
import { Then } from "@cucumber/cucumber";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { stripVTControlCharacters } from "node:util";
import { expect, type ParsedStack } from "vitest";
import { join, relative } from "../support/paths.ts";
import type { E2EWorld, RunResult } from "../support/world.ts";

/**
 * A scenario's status, as its Vitest test's state: a scenario that's undefined, pending or ambiguous
 * fails, as in cucumber (strict).
 */
const states: Record<string, string> = {
  passed: "passed",
  skipped: "skipped",
  failed: "failed",
  undefined: "failed",
  pending: "failed",
  ambiguous: "failed",
};
const stateOf = (status: string) => {
  const state = states[status];
  if (!state) {
    throw new Error(`Unknown status "${status}"`);
  }
  return state;
};

/**
 * Every scenario Vitest ran, in order: its name (an example's, without its number: `#1.2: `), and
 * its test's state.
 */
const scenarios = ({ tests }: RunResult) =>
  tests
    .filter(({ ran }) => ran)
    .map(({ ownName, state }) => ({
      name: ownName.replace(/^#[\d.]+: /, ""),
      status: state,
    }));

/** The run's test named `name` (its full name). */
const testNamed = (run: RunResult, name: string) =>
  run.tests.find((test) => test.name === name);

/** The run's scenario named `name` (its own name: the scenario's or example's). */
const scenarioNamed = (run: RunResult, name: string) =>
  run.tests.find(({ ownName }) => ownName === name);

const expectedScenarios = (table: DataTable) =>
  table
    .hashes()
    .map(({ NAME, STATUS }) => ({ name: NAME, status: stateOf(STATUS) }));

Then("it passes", (world: E2EWorld) => {
  expect(world.lastRun.exitCode, world.lastRun.output).toBe(0);
});

Then("it fails", (world: E2EWorld) => {
  expect(world.lastRun.exitCode, world.lastRun.output).not.toBe(0);
});

for (const [step, state] of [
  ["the feature file {string} passes", "passed"],
  ["the feature file {string} fails", "failed"],
]) {
  Then(step, (world: E2EWorld, file: string) => {
    expect(world.lastRun.modules.get(file), world.lastRun.output).toBe(state);
  });
}

Then("it runs the scenarios:", (world: E2EWorld, table: DataTable) => {
  expect(scenarios(world.lastRun), world.lastRun.output).toEqual(
    expectedScenarios(table),
  );
});

// Several projects run at the same time: their scenarios come in any order.
Then(
  "it runs the scenarios, in any order:",
  (world: E2EWorld, table: DataTable) => {
    const byName = (a: { name: string }, b: { name: string }) =>
      a.name.localeCompare(b.name);
    expect(scenarios(world.lastRun).sort(byName), world.lastRun.output).toEqual(
      expectedScenarios(table).sort(byName),
    );
  },
);

Then("it runs no scenarios", (world: E2EWorld) => {
  expect(scenarios(world.lastRun), world.lastRun.output).toEqual([]);
});

// Its text, without its colors (a page's diffs are colored whatever the terminal: Vitest's).
Then("the output contains:", (world: E2EWorld, text: string) => {
  expect(stripVTControlCharacters(world.lastRun.output)).toContain(text);
});

Then("the output doesn't contain:", (world: E2EWorld, text: string) => {
  expect(stripVTControlCharacters(world.lastRun.output)).not.toContain(text);
});

// A file the run wrote, in the directory it ran in: e.g. a cucumber formatter's
// (`format: [["message", "messages.ndjson"]]`).
Then(
  "the file {string} contains:",
  async (world: E2EWorld, name: string, text: string) => {
    expect(
      await readFile(path.join(world.lastRun.dir, name), "utf8"),
    ).toContain(text);
  },
);

// A file native cucumber's own formatter wrote: its locations are cucumber's (`path.relative`), with
// the platform's separator (`\` on Windows), where the plugin's and Vitest's have `/`.
Then(
  "the file {string} contains, with the platform's separators:",
  async (world: E2EWorld, name: string, text: string) => {
    expect(
      await readFile(path.join(world.lastRun.dir, name), "utf8"),
    ).toContain(text.replaceAll("/", path.sep));
  },
);

Then("the file {string} doesn't exist", (world: E2EWorld, name: string) => {
  expect(existsSync(path.join(world.lastRun.dir, name))).toBe(false);
});

// Vitest's coverage of a file, as its json reporter writes it (`coverage/coverage-final.json`): each
// line a statement starts at, its hits (its statements' most).
Then(
  "the coverage of {string} is:",
  async (world: E2EWorld, name: string, table: DataTable) => {
    const report = JSON.parse(
      await readFile(
        path.join(world.lastRun.dir, "coverage/coverage-final.json"),
        "utf8",
      ),
    ) as Record<
      string,
      {
        statementMap: Record<string, { start: { line: number } }>;
        s: Record<string, number>;
      }
    >;
    const file = report[path.join(world.lastRun.dir, name)];
    if (!file) {
      throw new Error(
        `No coverage of ${name}:\n${Object.keys(report).join("\n")}`,
      );
    }
    const lines = new Map<number, number>();
    for (const [id, { start }] of Object.entries(file.statementMap)) {
      lines.set(
        start.line,
        Math.max(lines.get(start.line) ?? 0, file.s[id] ?? 0),
      );
    }
    expect(
      [...lines]
        .sort(([a], [b]) => a - b)
        .map(([line, hits]) => ({ line, hits })),
    ).toEqual(
      table
        .hashes()
        .map(({ LINE, HITS }) => ({ line: Number(LINE), hits: Number(HITS) })),
    );
  },
);

Then(
  "the scenario {string} fails with:",
  (world: E2EWorld, name: string, message: string) => {
    const test = scenarioNamed(world.lastRun, name);
    expect(test?.state, world.lastRun.output).toBe("failed");
    expect(test?.errors.join("\n")).toContain(message);
  },
);

// A scenario's error's frames, as Vitest prints them, against a plain Vitest test's (`tests/`) for
// the same error in the same run, the engine's own: first the scenario's `STEP` (its line in the
// feature file), then the user's frames in `file` the plain test's, none of cucumber's.
Then(
  "each scenario's frames in {string} are its plain test's:",
  (world: E2EWorld, file: string, table: DataTable) => {
    const { dir, output, tests } = world.lastRun;
    const framesOf = (name: string) => {
      const test = tests.find((test) => test.name === name);
      expect(test?.state, `${name}:\n${output}`).toBe("failed");
      return test?.stacks[0] ?? [];
    };
    const at = (frames: ParsedStack[], name: string) =>
      frames
        .filter((frame) => frame.file === join(dir, name))
        .map(({ method, line, column }) => ({ method, line, column }));
    for (const { SCENARIO, TEST, STEP } of table.hashes()) {
      const scenario = framesOf(SCENARIO ?? "");
      const [first] = scenario;
      expect(
        first && `${relative(dir, first.file)}:${first.line}`,
        output,
      ).toBe(STEP);
      const own = at(scenario, file);
      expect(own, `${SCENARIO}:\n${output}`).not.toEqual([]);
      expect(own, `${SCENARIO}:\n${output}`).toEqual(
        at(framesOf(TEST ?? ""), file),
      );
      expect(
        scenario.filter((frame) =>
          frame.file.includes("/node_modules/@cucumber/"),
        ),
        output,
      ).toEqual([]);
    }
  },
);

/** How many times the output shows `text`. */
const occurrences = (output: string, text: string) =>
  output.split(text).length - 1;

// The scenarios' hooks log it: `console.log("<name> hook ran")`.
Then(
  "the {word} hooks run {int} time(s)",
  (world: E2EWorld, name: string, times: number) => {
    expect(
      occurrences(world.lastRun.output, `${name} hook ran`),
      world.lastRun.output,
    ).toBe(times);
  },
);

Then(
  "the scenario {string} is attempted {int} time(s)",
  (world: E2EWorld, name: string, times: number) => {
    const test = scenarioNamed(world.lastRun, name);
    expect(test?.retryCount, world.lastRun.output).toBe(times - 1);
  },
);

// In any order: Vitest runs the feature files in parallel.
// With a `NOTE` column, each skipped test's note too (`ctx.skip(note)`; empty: none).
// What the last `vitest list` found, in its order: each test's full name and its `file:line:column`.
Then("it lists the tests:", (world: E2EWorld, table: DataTable) => {
  if (!world.listed) {
    throw new Error(
      "Nothing listed: add a `When I list its tests in <mode> mode` step",
    );
  }
  expect(world.listed.errors, world.listed.output).toEqual([]);
  expect(world.listed.tests, world.listed.output).toEqual(
    table.hashes().map(({ NAME, LOCATION }) => ({
      name: NAME,
      location: LOCATION,
    })),
  );
});

Then("Vitest reports the tests:", (world: E2EWorld, table: DataTable) => {
  const byName = (tests: { name: string }[]) =>
    tests.toSorted((a, b) => a.name.localeCompare(b.name));
  const rows = table.hashes();
  const withNotes = rows.some((row) => "NOTE" in row);
  expect(
    byName(
      world.lastRun.tests.map(({ name, state, note }) => ({
        name,
        state,
        ...(withNotes && { note }),
      })),
    ),
    world.lastRun.output,
  ).toEqual(
    byName(
      rows.map(({ NAME, STATE, NOTE }) => ({
        name: NAME,
        state: STATE,
        ...(withNotes && { note: NOTE || undefined }),
      })),
    ),
  );
});

/** A table of annotations, in order. `CONTENT TYPE` empty: one without an attachment (a log, a link). */
const annotationsOf = (table: DataTable) =>
  table.hashes().map(({ TYPE, MESSAGE, "CONTENT TYPE": contentType }) => ({
    type: TYPE,
    message: MESSAGE,
    ...(contentType && { contentType }),
  }));

Then(
  "the test {string} has the annotations:",
  (world: E2EWorld, name: string, table: DataTable) => {
    const test = testNamed(world.lastRun, name);
    expect(test?.annotations, world.lastRun.output).toEqual(
      annotationsOf(table),
    );
  },
);

// Every test of that name (e.g. one per browser instance), at least one.
Then(
  "each test {string} has the annotations:",
  (world: E2EWorld, name: string, table: DataTable) => {
    const tests = world.lastRun.tests.filter((test) => test.name === name);
    expect(tests.length, world.lastRun.output).toBeGreaterThan(0);
    for (const test of tests) {
      expect(test.annotations, world.lastRun.output).toEqual(
        annotationsOf(table),
      );
    }
  },
);

// Without colors: a message can carry them (cucumber's summary in Vitest's colors, as Vitest's own
// `toHaveBeenCalledWith` does).
Then(
  "the test {string} fails with:",
  (world: E2EWorld, name: string, message: string) => {
    const test = testNamed(world.lastRun, name);
    expect(test?.state, world.lastRun.output).toBe("failed");
    expect(stripVTControlCharacters(test?.errors.join("\n") ?? "")).toContain(
      message,
    );
  },
);

/** Whether `text` has color codes. */
const hasColors = (text: string) => stripVTControlCharacters(text) !== text;

Then(
  "the test {string} has colors in its error as Vitest's output has",
  (world: E2EWorld, name: string) => {
    const error = testNamed(world.lastRun, name)?.errors.join("\n") ?? "";
    expect(error, world.lastRun.output).not.toBe("");
    expect(hasColors(error), error).toBe(hasColors(world.lastRun.output));
  },
);

// The scenarios' steps log it: `console.log(`worker id: ${id}`)`.
Then(
  "the scenarios log {int} different worker id(s)",
  (world: E2EWorld, count: number) => {
    const ids = [...world.lastRun.output.matchAll(/worker id: (\S*)/g)].map(
      ([, id]) => id,
    );
    expect(ids, world.lastRun.output).not.toEqual([]);
    // Numbers, as cucumber's.
    expect(ids, world.lastRun.output).toEqual(
      ids.map(() => expect.stringMatching(/^\d+$/)),
    );
    expect(new Set(ids).size, world.lastRun.output).toBe(count);
  },
);

// The cucumber the scenarios' projects get: this repository's.
Then(
  "the output contains the installed cucumber's version, after {string}",
  (world: E2EWorld, prefix: string) => {
    const { version } = createRequire(import.meta.url)(
      "@cucumber/cucumber/package.json",
    ) as { version: string };
    expect(world.lastRun.output).toContain(`${prefix}${version}`);
  },
);
