import type { TestRunFinished, TestRunStarted } from "@cucumber/messages";
import crypto from "node:crypto";
import fs from "node:fs";
import { tmpdir } from "node:os";
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

// Provisions the publish dir on first call (idempotent) and stores it in the
// env so all workers and the globalSetup teardown use the same path.
export const ensurePublishDir = (
  publish: boolean | undefined,
): string | undefined => {
  if (!publish) {
    return undefined;
  }
  process.env[PUBLISH_DIR_ENV] ??= fs.mkdtempSync(
    path.join(tmpdir(), "vitest-cucumber-publish-"),
  );
  return process.env[PUBLISH_DIR_ENV];
};

// SHA-1 of the project name for a filesystem-safe subdir per project.
const projectDirName = (projectName?: string): string =>
  crypto
    .createHash("sha1")
    .update(projectName || "default")
    .digest("hex");

// Appends a feature's envelopes as a JSONL file in the project's subdir.
// `projectName` comes from the caller's realm (worker ctx or command ctx).
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
  // ISO 8601 prefix with `:` and `.` replaced for filesystem safety; sorts chronologically.
  const prefix = startedAt.toISOString().replace(/[:.]/g, "-");
  await fs.promises.writeFile(
    path.join(dir, `${prefix}-${crypto.randomUUID()}.jsonl`),
    `${envelopes.map((e) => JSON.stringify(e)).join("\n")}\n`,
  );
};

type Envelope = Record<string, unknown>;

// Rewrites `testRunStartedId` back-references in envelope bodies to the
// canonical id, so later runs don't dangle when their start envelope is dropped.
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

// Synthesizes a single testRunFinished from all per-run finishes:
// success = no failure, message/exception from the first failure, timestamp from the last.
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

// Streams JSONL files as envelope objects; no file is fully buffered.
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

// Folds N per-run envelope streams into one coherent run in a single pass:
// keeps first meta/testRunStarted, rewrites back-references, drops later starts,
// accumulates and replaces all testRunFinished with one synthesized finish.
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

// Strip ANSI when stderr doesn't support colour (e.g. CI).
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

// Merges a project's per-feature JSONL files and uploads the report.
// Streams merge → JSONL → gzip → disk → PUT for constant memory.
const publishProjectReport = async (
  dir: string,
  projectName?: string,
): Promise<void> => {
  // ISO-prefixed filenames sort chronologically, so the earliest start is first.
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
      // Stream the gzip from disk (half-duplex) to avoid buffering the full report.
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
