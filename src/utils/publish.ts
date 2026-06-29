import type { TestRunFinished, TestRunStarted } from "@cucumber/messages";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { stripVTControlCharacters } from "node:util";
import { createGzip } from "node:zlib";
import jsonlParser from "stream-chain/jsonl/parserStream.js";
import jsonlStringer from "stream-chain/jsonl/stringerStream.js";

const DEFAULT_URL = "https://reports.cucumber.io/api/reports";
export const PUBLISH_DIR_ENV = "VITEST_CUCUMBER_PUBLISH_DIR";

const publishDir = (): string | undefined => process.env[PUBLISH_DIR_ENV];

// Whether `--publish` is active (the run folder has been provisioned).
export const isPublishEnabled = (): boolean => Boolean(publishDir());

// A filesystem-safe subdir name for a project: hash the (possibly decorated,
// space/paren-laden) name so it can't break `mkdir`. Each project writes into
// its own subdir of the run base dir, so the teardown can publish one report
// per project instead of merging every project into one.
const projectDirName = (projectName?: string): string =>
  crypto
    .createHash("sha1")
    .update(projectName || "default")
    .digest("hex");

// Worker side: append a feature's collected envelopes as a JSONL file in this
// project's subdir of the run's publish dir (created lazily). `projectName` is
// supplied by the caller from its own realm (node: the worker's
// `ctx.projectName`; browser: the command's `ctx.project.name`) and matches the
// name the globalSetup teardown publishes by. The cucumber start timestamp is
// encoded as a filename prefix so `publishReport` can replay the runs in
// chronological order. No-op when not publishing or nothing to write.
export const writeEnvelopes = async ({
  envelopes,
  startedAt,
  projectName,
}: {
  envelopes: unknown[];
  startedAt: Date;
  projectName?: string;
}): Promise<void> => {
  const base = publishDir();
  if (!base || envelopes.length === 0) {
    return;
  }
  const dir = path.join(base, projectDirName(projectName));
  await fs.promises.mkdir(dir, { recursive: true });
  // Encode the cucumber start time as an ISO 8601 prefix (with `:`/`.` swapped
  // for `-` to stay filesystem-safe). ISO 8601 sorts lexicographically in
  // chronological order, so a plain `.sort()` replays runs oldest-first.
  const prefix = startedAt.toISOString().replace(/[:.]/g, "-");
  await fs.promises.writeFile(
    path.join(dir, `${prefix}-${crypto.randomUUID()}.jsonl`),
    `${envelopes.map((e) => JSON.stringify(e)).join("\n")}\n`,
  );
};

type Envelope = Record<string, unknown>;

// Every run emits its own `testRunStarted` (unique id), and its body envelopes
// back-reference it via `testRunStartedId` — `testRunHookStarted` (our
// BeforeAll/AfterAll), `testCase`, `attachment` and `testRunFinished`. We keep
// only the FIRST `testRunStarted`, so rewrite every back-reference to its id;
// otherwise runs 2..N dangle at a dropped start. The field is always a direct
// property of the single message under the wrapper, so one level suffices.
const rewriteRunStartedId = ({
  envelope,
  canonicalId,
}: {
  envelope: Envelope;
  canonicalId: string | undefined;
}): void => {
  if (canonicalId === undefined) {
    return;
  }
  for (const message of Object.values(envelope)) {
    if (
      message !== null &&
      typeof message === "object" &&
      "testRunStartedId" in message
    ) {
      message.testRunStartedId = canonicalId;
    }
  }
};

// Every per-feature run (plus the lifecycle AfterAll run) emits its own
// `testRunFinished`, each reporting only its own slice. Synthesize ONE that
// describes the whole execution from just two tracked finishes:
// - `success`: true only when no run failed (`firstFailure` is undefined);
// - `message`/`exception`: from the FIRST failing run (the failure to show);
// - `timestamp`: from the LAST run (the true end of the whole execution);
// - `testRunStartedId`: the surviving (first) `testRunStarted`'s id.
const synthesizeRunFinished = ({
  lastFinish,
  firstFailure,
  canonicalId,
}: {
  lastFinish: TestRunFinished | undefined;
  firstFailure: TestRunFinished | undefined;
  canonicalId: string | undefined;
}): { testRunFinished: TestRunFinished } | undefined => {
  if (!lastFinish) {
    return undefined;
  }
  return {
    testRunFinished: {
      ...lastFinish,
      ...(firstFailure !== undefined && {
        success: false,
        message: firstFailure.message,
        exception: firstFailure.exception,
      }),
      testRunStartedId: canonicalId,
    },
  };
};

// Parse every per-feature JSONL file into a stream of envelope objects, one
// file after another. Uses stream-chain's JSONL parser stream so no file is
// ever fully buffered — it emits `{ key, value }` per line; we yield the
// `value`.
async function* parseEnvelopeFiles(
  dir: string,
  files: string[],
): AsyncGenerator<Envelope> {
  for (const file of files) {
    const lines = fs.createReadStream(path.join(dir, file)).pipe(jsonlParser());
    for await (const { value } of lines as AsyncIterable<{ value: Envelope }>) {
      yield value;
    }
  }
}

// Fold the concatenated per-run envelope streams into one coherent run in a
// single pass. The first `meta` and `testRunStarted` (which lead each run) pass
// through and fix the canonical id; later ones are dropped; bodies are
// rewritten and forwarded; every `testRunFinished` is accumulated and replaced
// by one synthesized finish at the end. Nothing but the small run brackets is
// ever held in memory.
export async function* mergeEnvelopeStream(
  dir: string,
  files: string[],
): AsyncGenerator<Envelope> {
  let metaSeen = false;
  let startSeen = false;
  let canonicalId: string | undefined;
  let lastFinish: TestRunFinished | undefined;
  let firstFailure: TestRunFinished | undefined;

  for await (const envelope of parseEnvelopeFiles(dir, files)) {
    if ("meta" in envelope) {
      if (!metaSeen) {
        metaSeen = true;
        yield envelope;
      }
      continue;
    }
    if ("testRunStarted" in envelope) {
      if (!startSeen) {
        startSeen = true;
        canonicalId = (envelope.testRunStarted as TestRunStarted).id;
        yield envelope;
      }
      continue;
    }
    if ("testRunFinished" in envelope) {
      lastFinish = envelope.testRunFinished as TestRunFinished;
      // Remember the first run that failed (keep the earliest, ignore passes).
      if (!lastFinish.success) {
        firstFailure ??= lastFinish;
      }
      continue;
    }
    rewriteRunStartedId({ envelope, canonicalId });
    yield envelope;
  }

  const finish = synthesizeRunFinished({
    lastFinish,
    firstFailure,
    canonicalId,
  });
  if (finish) {
    yield finish;
  }
}

// The Cucumber Reports service returns a pre-formatted console banner that
// includes ANSI escapes. Mirror cucumber-js: strip them when stderr doesn't
// support colour (e.g. piped/CI), otherwise pass them through verbatim.
const sanitisePublishOutput = (raw: string): string =>
  process.stderr.isTTY && process.stderr.hasColors?.()
    ? raw
    : stripVTControlCharacters(raw);

// Print a project's report banner to stderr, headed by a labelled title rule.
const printReportBanner = ({
  projectName,
  banner,
}: {
  projectName?: string;
  banner: string;
}): void => {
  const title = projectName
    ? `\nCucumber report for project: ${projectName}\n`
    : "\n";
  process.stderr.write(title);
  process.stderr.write(`${sanitisePublishOutput(banner)}`);
};

// Merge one project's subdir (all its per-feature JSONL files) into a single
// report and upload it. Streams merge → JSONL → gzip → disk → PUT, so nothing is
// ever fully buffered. Returns without uploading when the subdir has no files.
const publishProjectReport = async (
  dir: string,
  projectName?: string,
): Promise<void> => {
  // Replay the per-feature files in chronological order. Their names are
  // prefixed with the ISO 8601 cucumber start timestamp, so a plain lexicographic
  // sort puts the earliest `testRunStarted` first and the latest finished last.
  const files = (await fs.promises.readdir(dir))
    .filter((f) => f.endsWith(".jsonl"))
    .sort();
  if (files.length === 0) {
    return;
  }

  const gzPath = path.join(dir, "report.jsonl.gz");
  await pipeline(
    Readable.from(mergeEnvelopeStream(dir, files)),
    jsonlStringer({ separator: "\n", suffix: "\n" }),
    createGzip(),
    fs.createWriteStream(gzPath),
  );
  const { size: gzSize } = await fs.promises.stat(gzPath);

  const url = process.env.CUCUMBER_PUBLISH_URL || DEFAULT_URL;
  const token = process.env.CUCUMBER_PUBLISH_TOKEN;
  const headers: Record<string, string> = { Accept: "application/json" };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  try {
    const touch = await fetch(url, { headers });
    // Server error: log like cucumber-js and skip (the body isn't a banner).
    if (touch.status >= 500) {
      console.error(
        `Failed to publish report to ${new URL(url).origin} with status ${touch.status.toString()}`,
      );
      return;
    }
    const result = (await touch.json().catch(() => ({}))) as {
      banner?: string;
    };
    // Touch rejected (e.g. bad token): the service explains why in the banner.
    if (!touch.ok) {
      if (result.banner) {
        printReportBanner({ projectName, banner: result.banner });
      }
      return;
    }
    const uploadUrl = touch.headers.get("Location");
    if (!uploadUrl) {
      return;
    }
    const upload = await fetch(uploadUrl, {
      method: "PUT",
      headers: {
        "Content-Type": "application/jsonl",
        "Content-Encoding": "gzip",
        "Content-Length": String(gzSize),
      },
      // Stream the gzip straight from disk so memory stays constant regardless
      // of report size (half-duplex: send the body, then read).
      body: fs.createReadStream(gzPath),
      duplex: "half",
    });
    if (upload.ok) {
      // The service banner carries the report URL; print it like cucumber-js,
      // headed by the project name so multi-project runs are distinguishable.
      if (result.banner) {
        printReportBanner({ projectName, banner: result.banner });
      }
    } else {
      console.error(
        `Failed to upload report to ${new URL(uploadUrl).origin} with status ${upload.status.toString()}`,
      );
      console.error(await upload.text());
    }
  } catch (error) {
    // Publishing is best-effort (mirrors cucumber-js): a network failure must
    // never fail the Vitest run. Unlike cucumber-js we run in a globalSetup
    // teardown, where an uncaught throw WOULD fail it — so log and move on.
    console.error(
      `Failed to publish report for project "${projectName ?? "default"}": ${String(error)}`,
    );
  }
};

// Main process (globalSetup teardown, once PER project): publish this project's
// report from its own subdir (written by `writeEnvelopes`). `projectName` comes
// straight from the globalSetup `setup(project)`, so it matches the subdir the
// workers wrote to — no label file or cross-project scan needed. No-op when not
// publishing or the project wrote nothing.
export const publishReport = async (projectName?: string): Promise<void> => {
  const base = publishDir();
  if (!base) {
    return;
  }
  const dir = path.join(base, projectDirName(projectName));
  const exists = await fs.promises
    .access(dir)
    .then(() => true)
    .catch(() => false);
  if (!exists) {
    return;
  }
  try {
    await publishProjectReport(dir, projectName);
  } finally {
    await fs.promises.rm(dir, { recursive: true, force: true });
    // Best-effort: drop the run base dir once its last project subdir is gone.
    await fs.promises.rmdir(base).catch(() => undefined);
  }
};
