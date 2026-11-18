// The compatibility kit's steps (`../*.feature`, generated: `../utils/generate.ts`), on e2e's harness
// (its World, its projects, its runs: `e2e/support/`): a sample's files in the scenario's project,
// run with native cucumber and with the plugin in a mode, compared (`../utils/kit.ts`). The
// project's `features/`: the sample's feature files, its steps for cucumber (`steps/`, native
// cucumber's and node mode's) and for a page (`steps-page/`, browser and storybook modes'), the
// plugin's `import` the mode's. Both runs' outputs and the comparison (`report.md`) stay in the
// project.
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
} from "../utils/kit.ts";

const repo = path.resolve(import.meta.dirname, "../..");

/** A scenario's sample, and native cucumber's run of it. */
const runs = new WeakMap<
  E2EWorld,
  {
    sample: string;
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

Given(
  "the compatibility kit's sample {string}",
  async function (this: E2EWorld, sample: string) {
    const { features, steps } = sampleFiles(sample);
    for (const { name, content } of features) {
      await this.write(`features/${name}`, content);
    }
    for (const { name, node, page } of steps) {
      await this.write(`features/steps/${name}`, node);
      await this.write(`features/steps-page/${name}`, page);
    }
    runs.set(this, { sample });
  },
);

When(
  "I run it with cucumber, and with vitest in {word} mode",
  { timeout: 120_000 },
  async function (this: E2EWorld, mode: string) {
    const run = runOf(this);
    const retry = retryOf(run.sample);
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
      this.dir,
    );
    await writeFile(path.join(this.dir, "native.txt"), native.output);
    const ndjson = await readFile(
      path.join(this.dir, "native.ndjson"),
      "utf8",
    ).catch(() => {
      throw new Error(`Native cucumber didn't run:\n${native.output}`);
    });
    run.native = { exitCode: native.exitCode, ndjson };
    run.mode = mode;
    // The plugin: the sample's steps, for cucumber in node mode, for a page in the others.
    this.pluginOptions = {
      import: [
        mode === "node"
          ? "features/steps/**/*.ts"
          : "features/steps-page/**/*.ts",
      ],
    };
    await writeDefaultConfig.call(this, mode as Mode);
    // Its messages too, as the plugin's stream has them (`e2e/support/messages.ts`).
    this.messages = [];
    await runVitest.call(this, retry ? { options: { retry } } : {});
    run.messages = this.messages;
    await writeFile(
      path.join(this.dir, "plugin.ndjson"),
      run.messages.map((envelope) => `${JSON.stringify(envelope)}\n`).join(""),
    );
  },
);

Then("vitest reports what cucumber does", async function (this: E2EWorld) {
  const { sample, mode, native } = ranOf(this);
  const scenarios = nativeResults(native.ndjson);
  expect(scenarios.length, "native cucumber ran no scenario").toBeGreaterThan(
    0,
  );
  const { differences, report } = compare(
    `${sample} (${String(mode)} mode)`,
    { exitCode: native.exitCode, scenarios },
    {
      exitCode: this.lastRun.exitCode,
      scenarios: this.lastRun.tests.map((test) => ({
        uri: test.module,
        name: test.ownName,
        state: test.state === "pending" ? "skipped" : test.state,
        attachments: test.annotations.map((annotation, at) =>
          attachmentOf(annotation, test.contents[at]),
        ),
      })),
    },
  );
  await writeFile(path.join(this.dir, "report.md"), report);
  expect(differences, `${report}\n${this.lastRun.output}`).toEqual([]);
});

Then("its messages are cucumber's", async function (this: E2EWorld) {
  const { native, mode, messages = [] } = ranOf(this);
  const nativeMessages = native.ndjson
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line) as object);
  const differences = compareMessages(nativeMessages, messages, {
    inPage: mode !== "node",
  });
  await writeFile(
    path.join(this.dir, "messages.md"),
    differences.length === 0
      ? "Same messages.\n"
      : `${differences.join("\n\n")}\n`,
  );
  expect(
    differences.slice(0, 5),
    `${String(differences.length)} differences (messages.md, plugin.ndjson, native.ndjson in ${this.dir})`,
  ).toEqual([]);
});
