// The compatibility kit's steps (`../*.feature`, generated: `../utils/generate.ts`), on e2e's harness
// (its World, its projects, its runs: `e2e/support/`): a sample's files in the scenario's project,
// run with native cucumber and with the plugin in a mode, compared (`../utils/kit.ts`). The
// project's `features/`: the sample's feature files and its steps (`steps/`): cucumber's copy for
// native cucumber and node mode, the page's copy written over it for browser and storybook modes
// once native cucumber has run. The plugin's options are the harness's default, so a sample's runs
// use the worker's kept Vitest of their mode (`e2e/support/kept.ts`; the project runs with
// `isolate: false`, so it serves every sample of the worker), but a `--retry` sample's (an option:
// a new Vitest). Both runs' outputs and the comparison (`report.md`) stay in the project.
import { Given, Then, When } from "@cucumber/cucumber";
import { spawn } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { expect } from "vitest";
import { writeDefaultConfig, type Mode } from "../../e2e/support/project.ts";
import { runVitest } from "../../e2e/support/runVitest.ts";
import { shellEnv } from "../../e2e/support/shellEnv.ts";
import type { E2EWorld } from "../../e2e/support/world.ts";
import {
  attachmentOf,
  compare,
  compareMessages,
  nativeResults,
  retryOf,
  sampleFiles,
  storybookSample,
} from "../utils/kit.ts";

const repo = path.resolve(import.meta.dirname, "../..");

/**
 * Native cucumber's run of a sample, by sample: the same in each of its node and browser rows, run
 * once; its storybook row's (its files as a Storybook project has them: `storybookSample`) apart.
 */
const nativeRuns = new Map<
  string,
  { exitCode: number; output: string; ndjson: string }
>();

/** A scenario's sample, its steps' page copies, and native cucumber's run of it. */
const runs = new WeakMap<
  E2EWorld,
  {
    sample: string;
    /** The sample's steps for a page, by file name (`features/steps/`). */
    pageSteps: { name: string; page: string }[];
    /** The sample's feature files, by file name (`features/`). */
    features: { name: string; content: string }[];
    mode?: string;
    native?: { exitCode: number; ndjson: string };
    /** The plugin's messages (its stream's: `e2e/support/messages.ts`), of the run's one project. */
    messages?: object[];
  }
>();

const runOf = (world: E2EWorld) => {
  const run = runs.get(world);
  if (!run) {
    throw new Error(
      'No sample: add a `Given the compatibility kit\'s sample "…"` step',
    );
  }
  return run;
};

/** The scenario's sample, run by both (`When I run it with cucumber, and with vitest…`). */
const ranOf = (world: E2EWorld) => {
  const { native, ...run } = runOf(world);
  if (!native) {
    throw new Error(
      "Not run: add a `When I run it with cucumber, and with vitest…` step",
    );
  }
  return { ...run, native };
};

/**
 * Runs native cucumber in `cwd`: its exit code and its output. Vitest's own variables (this run's)
 * are left out, as a shell's command has none (`shellEnv`).
 */
const runCucumber = (args: string[], cwd: string) =>
  new Promise<{ exitCode: number; output: string }>((resolve, reject) => {
    const child = spawn(
      process.execPath,
      [
        path.join(repo, "node_modules/@cucumber/cucumber/bin/cucumber.js"),
        ...args,
      ],
      { cwd, env: { ...shellEnv(), FORCE_COLOR: "0", NO_COLOR: "1", CI: "" } },
    );
    let output = "";
    child.stdout.on("data", (chunk: Buffer) => (output += chunk.toString()));
    child.stderr.on("data", (chunk: Buffer) => (output += chunk.toString()));
    child.on("error", reject);
    child.on("close", (code) => {
      resolve({ exitCode: code ?? 1, output });
    });
  });

/** Native cucumber's run of the sample in `cwd` (its steps cucumber's copy): exit code, output, messages. */
const runNative = async (cwd: string, retry: number | undefined) => {
  const native = await runCucumber(
    [
      "features/*.feature",
      "features/*.feature.md",
      "--import",
      "features/steps/**/*.ts",
      "--format",
      "message:native.ndjson",
      ...(retry ? ["--retry", String(retry)] : []),
    ],
    cwd,
  );
  const ndjson = await readFile(path.join(cwd, "native.ndjson"), "utf8").catch(
    () => {
      throw new Error(`Native cucumber didn't run:\n${native.output}`);
    },
  );
  return { ...native, ndjson };
};

Given(
  "the compatibility kit's sample {string}",
  async (world: E2EWorld, sample: string) => {
    const { features, steps } = sampleFiles(sample);
    for (const { name, content } of features) {
      await world.write(`features/${name}`, content);
    }
    for (const { name, node } of steps) {
      await world.write(`features/steps/${name}`, node);
    }
    runs.set(world, { sample, pageSteps: steps, features });
  },
);

When(
  "I run it with cucumber, and with vitest in {word} mode",
  { timeout: 120_000 },
  async (world: E2EWorld, mode: string) => {
    const run = runOf(world);
    const retry = retryOf(run.sample);
    // In a Storybook project, its feature files name their stories (for both runs).
    const storybook = mode === "storybook";
    if (storybook) {
      for (const { name, content } of run.features) {
        await world.write(
          `features/${name}`,
          storybookSample.feature(name, content),
        );
      }
      await world.write(
        `features/steps/${storybookSample.steps.name}`,
        storybookSample.steps.native,
      );
    }
    const key = storybook ? `${run.sample} (storybook)` : run.sample;
    const native = nativeRuns.get(key) ?? (await runNative(world.dir, retry));
    nativeRuns.set(key, native);
    // Each row's project has native cucumber's outputs, its run's or the sample's first row's.
    await writeFile(path.join(world.dir, "native.txt"), native.output);
    await writeFile(path.join(world.dir, "native.ndjson"), native.ndjson);
    run.native = { exitCode: native.exitCode, ndjson: native.ndjson };
    run.mode = mode;
    // The plugin: the sample's steps, cucumber's copy in node mode, the page's in the others.
    if (mode !== "node") {
      for (const { name, page } of [
        ...run.pageSteps,
        ...(storybook ? [storybookSample.steps] : []),
      ]) {
        await world.write(`features/steps/${name}`, page);
      }
    }
    await writeDefaultConfig.call(world, mode as Mode);
    // Its messages too, as the plugin's stream has them (`e2e/support/messages.ts`).
    world.messages = [];
    await runVitest.call(world, retry ? { options: { retry } } : {});
    run.messages = world.messages;
    await writeFile(
      path.join(world.dir, "plugin.ndjson"),
      run.messages.map((envelope) => `${JSON.stringify(envelope)}\n`).join(""),
    );
  },
);

Then("vitest reports what cucumber does", async (world: E2EWorld) => {
  const { sample, mode, native } = ranOf(world);
  const scenarios = nativeResults(native.ndjson);
  expect(scenarios.length, "native cucumber ran no scenario").toBeGreaterThan(
    0,
  );
  const { differences, report } = compare(
    `${sample} (${String(mode)} mode)`,
    { exitCode: native.exitCode, scenarios },
    {
      exitCode: world.lastRun.exitCode,
      scenarios: world.lastRun.tests.map((test) => ({
        uri: test.module,
        name: test.ownName,
        state: test.state === "pending" ? "skipped" : test.state,
        attachments: test.annotations.map((annotation, at) =>
          attachmentOf(annotation, test.contents[at]),
        ),
      })),
    },
  );
  await writeFile(path.join(world.dir, "report.md"), report);
  expect(differences, `${report}\n${world.lastRun.output}`).toEqual([]);
});

Then("its messages are cucumber's", async (world: E2EWorld) => {
  const { native, mode, messages = [] } = ranOf(world);
  const nativeMessages = native.ndjson
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line) as object);
  const differences = compareMessages(nativeMessages, messages, {
    inPage: mode !== "node",
  });
  await writeFile(
    path.join(world.dir, "messages.md"),
    differences.length === 0
      ? "Same messages.\n"
      : `${differences.join("\n\n")}\n`,
  );
  expect(
    differences.slice(0, 5),
    `${String(differences.length)} differences (messages.md, plugin.ndjson, native.ndjson in ${world.dir})`,
  ).toEqual([]);
});
