import {
  existsSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { gunzipSync } from "node:zlib";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  ensurePublishDir,
  mergeEnvelopeStream,
  publishReport,
  writeEnvelopes,
} from "../publish.ts";

const DIR_ENV = "VITEST_CUCUMBER_PUBLISH_DIR";

const ts = (seconds: number) => ({ seconds, nanos: 0 });

describe("merge logic (via mergeEnvelopeStream)", () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(path.join(tmpdir(), "vitest-cucumber-merge-test-"));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  const merge = async (envelopes: Record<string, unknown>[]) => {
    writeFileSync(
      path.join(dir, "run.jsonl"),
      `${envelopes.map((e) => JSON.stringify(e)).join("\n")}\n`,
    );
    const out: Record<string, unknown>[] = [];
    for await (const envelope of mergeEnvelopeStream(dir, ["run.jsonl"])) {
      out.push(envelope);
    }
    return out;
  };

  it("returns an empty array for no envelopes", async () => {
    expect(await merge([])).toEqual([]);
  });

  it("brackets the bodies with a single meta + start + finish", async () => {
    const merged = await merge([
      { meta: { protocolVersion: "1" } },
      { testRunStarted: { id: "s1", timestamp: ts(0) } },
      { testCase: { id: "tc1", pickleId: "p1", testRunStartedId: "s1" } },
      { testRunFinished: { success: true, timestamp: ts(5) } },
    ]);

    expect(merged.map((e) => Object.keys(e)[0])).toEqual([
      "meta",
      "testRunStarted",
      "testCase",
      "testRunFinished",
    ]);
  });

  it("keeps the FIRST testRunStarted and drops later ones", async () => {
    const merged = await merge([
      { testRunStarted: { id: "s1", timestamp: ts(0) } },
      { testRunFinished: { success: true, timestamp: ts(1) } },
      { testRunStarted: { id: "s2", timestamp: ts(2) } },
      { testRunFinished: { success: true, timestamp: ts(3) } },
    ]);

    const starts = merged.filter((e) => "testRunStarted" in e);
    expect(starts).toHaveLength(1);
    expect((starts[0].testRunStarted as { id: string }).id).toBe("s1");
  });

  it("synthesizes one testRunFinished with the LAST timestamp", async () => {
    const merged = await merge([
      { testRunStarted: { id: "s1", timestamp: ts(0) } },
      { testRunFinished: { success: true, timestamp: ts(1) } },
      { testRunFinished: { success: true, timestamp: ts(9) } },
    ]);

    const finishes = merged.filter((e) => "testRunFinished" in e);
    expect(finishes).toHaveLength(1);
    expect(
      (finishes[0].testRunFinished as { timestamp: { seconds: number } })
        .timestamp.seconds,
    ).toBe(9);
  });

  it("ANDs success across all runs", async () => {
    const merged = await merge([
      { testRunFinished: { success: true, timestamp: ts(1) } },
      { testRunFinished: { success: false, timestamp: ts(2) } },
      { testRunFinished: { success: true, timestamp: ts(3) } },
    ]);

    const finish = merged.find((e) => "testRunFinished" in e);
    expect((finish?.testRunFinished as { success: boolean }).success).toBe(
      false,
    );
  });

  it("carries message/exception from the FIRST failing run", async () => {
    const merged = await merge([
      { testRunFinished: { success: true, timestamp: ts(1) } },
      {
        testRunFinished: {
          success: false,
          timestamp: ts(2),
          message: "first failure",
          exception: { type: "Error", message: "first failure" },
        },
      },
      {
        testRunFinished: {
          success: false,
          timestamp: ts(3),
          message: "second failure",
        },
      },
    ]);

    const finish = merged.find((e) => "testRunFinished" in e)?.testRunFinished;
    expect(finish).toMatchObject({
      success: false,
      message: "first failure",
      exception: { type: "Error", message: "first failure" },
    });
  });

  it("omits message/exception when every run passed", async () => {
    const merged = await merge([
      { testRunFinished: { success: true, timestamp: ts(1) } },
    ]);

    const finish = merged.find((e) => "testRunFinished" in e)
      ?.testRunFinished as Record<string, unknown>;
    expect(finish.success).toBe(true);
    expect("message" in finish).toBe(false);
    expect("exception" in finish).toBe(false);
  });

  it("rewrites every testRunStartedId back-reference to the first start id", async () => {
    const merged = await merge([
      { testRunStarted: { id: "s1", timestamp: ts(0) } },
      { testRunHookStarted: { id: "h1", hookId: "H", testRunStartedId: "s1" } },
      { testCase: { id: "tc1", pickleId: "p1", testRunStartedId: "s1" } },
      {
        attachment: {
          body: "x",
          mediaType: "text/plain",
          testRunStartedId: "s1",
        },
      },
      { testRunFinished: { success: true, timestamp: ts(1) } },
      // second run with a different start id
      { testRunStarted: { id: "s2", timestamp: ts(2) } },
      { testCase: { id: "tc2", pickleId: "p2", testRunStartedId: "s2" } },
      { testRunFinished: { success: true, timestamp: ts(3) } },
    ]);

    const ids = merged
      .flatMap((e) => Object.values(e))
      .filter(
        (m): m is { testRunStartedId: string } =>
          typeof m === "object" && m !== null && "testRunStartedId" in m,
      )
      .map((m) => m.testRunStartedId);

    expect(ids.length).toBeGreaterThan(0);
    expect(ids.every((id) => id === "s1")).toBe(true);
  });

  it("produces no testRunFinished when none is present", async () => {
    const merged = await merge([
      { testRunStarted: { id: "s1", timestamp: ts(0) } },
      { testCase: { id: "tc1", pickleId: "p1", testRunStartedId: "s1" } },
    ]);

    expect(merged.some((e) => "testRunFinished" in e)).toBe(false);
  });

  it("passes a body envelope through unchanged when no testRunStarted has been seen yet", async () => {
    // canonicalId is undefined at this point — rewriteRunStartedId early-returns.
    const merged = await merge([
      {
        testCase: {
          id: "tc1",
          pickleId: "p1",
          testRunStartedId: "original-id",
        },
      },
    ]);
    const tc = merged.find((e) => "testCase" in e)?.testCase as {
      testRunStartedId: string;
    };
    expect(tc?.testRunStartedId).toBe("original-id");
  });
});

describe("mergeEnvelopeStream", () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(path.join(tmpdir(), "vitest-cucumber-publish-test-"));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  const writeRun = (name: string, envelopes: Record<string, unknown>[]) => {
    writeFileSync(
      path.join(dir, name),
      `${envelopes.map((e) => JSON.stringify(e)).join("\n")}\n`,
    );
  };

  const collect = async (files: string[]) => {
    const out: Record<string, unknown>[] = [];
    for await (const envelope of mergeEnvelopeStream(dir, files)) {
      out.push(envelope);
    }
    return out;
  };

  it("brackets a single run's bodies with meta + start + finish", async () => {
    writeRun("a.jsonl", [
      { meta: { protocolVersion: "1" } },
      { testRunStarted: { id: "s1", timestamp: ts(0) } },
      { testCase: { id: "tc1", pickleId: "p1", testRunStartedId: "s1" } },
      { testRunFinished: { success: true, timestamp: ts(5) } },
    ]);

    const merged = await collect(["a.jsonl"]);

    expect(merged.map((e) => Object.keys(e)[0])).toEqual([
      "meta",
      "testRunStarted",
      "testCase",
      "testRunFinished",
    ]);
  });

  it("merges multiple runs: one start, one synthesized finish, rewritten ids", async () => {
    writeRun("a.jsonl", [
      { meta: { protocolVersion: "1" } },
      { testRunStarted: { id: "s1", timestamp: ts(0) } },
      { testCase: { id: "tc1", pickleId: "p1", testRunStartedId: "s1" } },
      { testRunFinished: { success: true, timestamp: ts(1) } },
    ]);
    writeRun("b.jsonl", [
      { meta: { protocolVersion: "1" } },
      { testRunStarted: { id: "s2", timestamp: ts(2) } },
      { testCase: { id: "tc2", pickleId: "p2", testRunStartedId: "s2" } },
      {
        testRunFinished: {
          success: false,
          timestamp: ts(9),
          message: "boom",
        },
      },
    ]);

    const merged = await collect(["a.jsonl", "b.jsonl"]);

    // exactly one meta and one start (the first), both test cases, one finish
    expect(merged.filter((e) => "meta" in e)).toHaveLength(1);
    const starts = merged.filter((e) => "testRunStarted" in e);
    expect(starts).toHaveLength(1);
    expect((starts[0].testRunStarted as { id: string }).id).toBe("s1");
    expect(merged.filter((e) => "testCase" in e)).toHaveLength(2);

    const finishes = merged.filter((e) => "testRunFinished" in e);
    expect(finishes).toHaveLength(1);
    expect(finishes[0].testRunFinished).toMatchObject({
      success: false,
      message: "boom",
      timestamp: ts(9),
      testRunStartedId: "s1",
    });

    // every testRunStartedId back-reference rewritten to the first start id
    const ids = merged
      .flatMap((e) => Object.values(e))
      .filter(
        (m): m is { testRunStartedId: string } =>
          typeof m === "object" && m !== null && "testRunStartedId" in m,
      )
      .map((m) => m.testRunStartedId);
    expect(ids.every((id) => id === "s1")).toBe(true);
  });
});

describe("writeEnvelopes", () => {
  const originalDir = process.env[DIR_ENV];

  afterEach(() => {
    if (originalDir === undefined) {
      Reflect.deleteProperty(process.env, DIR_ENV);
    } else {
      process.env[DIR_ENV] = originalDir;
    }
  });

  it("is a no-op without a publish dir or with no envelopes", async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "vc-write-"));
    Reflect.deleteProperty(process.env, DIR_ENV);
    await writeEnvelopes({ envelopes: [{ meta: {} }], startedAt: new Date() });
    process.env[DIR_ENV] = dir;
    await writeEnvelopes({ envelopes: [], startedAt: new Date() });
    expect(readdirSync(dir)).toHaveLength(0);
    rmSync(dir, { recursive: true, force: true });
  });

  it("writes an ISO-prefixed JSONL file into a per-project subdir", async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "vc-write-"));
    process.env[DIR_ENV] = dir;
    const startedAt = new Date("2026-06-29T17:40:27.123Z");
    await writeEnvelopes({
      envelopes: [{ meta: { protocolVersion: "1" } }],
      startedAt,
      projectName: "node",
    });

    // The envelopes land in a per-project subdir (a hash of the project name).
    const [sub] = readdirSync(dir);
    const subFiles = readdirSync(path.join(dir, sub));
    const jsonl = subFiles.find((f) => f.endsWith(".jsonl"));
    expect(jsonl).toMatch(/^2026-06-29T17-40-27-123Z-.+\.jsonl$/);
    expect(readFileSync(path.join(dir, sub, jsonl as string), "utf8")).toBe(
      `${JSON.stringify({ meta: { protocolVersion: "1" } })}\n`,
    );
    rmSync(dir, { recursive: true, force: true });
  });
});

describe("publishReport", () => {
  let dir: string;
  const envBackup = {
    dir: process.env[DIR_ENV],
    url: process.env.CUCUMBER_PUBLISH_URL,
    token: process.env.CUCUMBER_PUBLISH_TOKEN,
  };

  beforeEach(() => {
    dir = mkdtempSync(path.join(tmpdir(), "vc-publish-"));
    process.env[DIR_ENV] = dir;
    process.env.CUCUMBER_PUBLISH_URL = "https://reports.test/api";
    process.env.CUCUMBER_PUBLISH_TOKEN = "tok";
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    for (const [key, value] of [
      [DIR_ENV, envBackup.dir],
      ["CUCUMBER_PUBLISH_URL", envBackup.url],
      ["CUCUMBER_PUBLISH_TOKEN", envBackup.token],
    ] as const) {
      if (value === undefined) {
        Reflect.deleteProperty(process.env, key);
      } else {
        process.env[key] = value;
      }
    }
  });

  const writeRun = (
    startedAt: Date,
    envelopes: Record<string, unknown>[],
  ): Promise<void> =>
    writeEnvelopes({ envelopes, startedAt, projectName: "node" });

  it("returns early when the run dir does not exist", async () => {
    process.env[DIR_ENV] = path.join(dir, "missing");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await publishReport("node");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns without uploading when the project wrote nothing", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await publishReport("node");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("merges, gzips and uploads a single report, then prints the banner", async () => {
    await writeRun(new Date("2026-01-01T00:00:00.000Z"), [
      { meta: { protocolVersion: "1" } },
      { testRunStarted: { id: "s1", timestamp: ts(0) } },
      { testCase: { id: "tc1", pickleId: "p1", testRunStartedId: "s1" } },
      { testRunFinished: { success: true, timestamp: ts(1) } },
    ]);
    await writeRun(new Date("2026-01-01T00:00:05.000Z"), [
      { meta: { protocolVersion: "1" } },
      { testRunStarted: { id: "s2", timestamp: ts(2) } },
      { testCase: { id: "tc2", pickleId: "p2", testRunStartedId: "s2" } },
      {
        testRunFinished: { success: false, timestamp: ts(9), message: "boom" },
      },
    ]);

    let uploadedBody: Buffer | undefined;
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (init?.method === "PUT") {
        // the body is a streamed read stream — drain it into a buffer
        const chunks: Buffer[] = [];
        for await (const chunk of init.body as unknown as AsyncIterable<Buffer>) {
          chunks.push(chunk);
        }
        uploadedBody = Buffer.concat(chunks);
        return new Response(null, { status: 200 });
      }
      return new Response(
        JSON.stringify({ banner: "View your report", url: "u" }),
        {
          status: 200,
          headers: { Location: "https://reports.test/upload/1" },
        },
      );
    });
    vi.stubGlobal("fetch", fetchMock);
    const stderr = vi.spyOn(process.stderr, "write").mockReturnValue(true);

    await publishReport("node");

    // touch (GET with auth) then upload (PUT gzip)
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const [touchUrl, touchInit] = fetchMock.mock.calls[0];
    expect(touchUrl).toBe("https://reports.test/api");
    expect((touchInit?.headers as Record<string, string>).Authorization).toBe(
      "Bearer tok",
    );
    const [uploadUrl, uploadInit] = fetchMock.mock.calls[1];
    expect(uploadUrl).toBe("https://reports.test/upload/1");
    expect(
      (uploadInit?.headers as Record<string, string>)["Content-Encoding"],
    ).toBe("gzip");

    // the uploaded gzip is the merged single-run stream
    const lines = gunzipSync(uploadedBody as Buffer)
      .toString("utf8")
      .split("\n")
      .filter(Boolean)
      .map((l) => JSON.parse(l) as Record<string, unknown>);
    expect(lines.filter((e) => "meta" in e)).toHaveLength(1);
    expect(lines.filter((e) => "testRunStarted" in e)).toHaveLength(1);
    expect(lines.filter((e) => "testCase" in e)).toHaveLength(2);
    const finish = lines.find((e) => "testRunFinished" in e)
      ?.testRunFinished as {
      success: boolean;
      message?: string;
    };
    expect(finish.success).toBe(false);
    expect(finish.message).toBe("boom");

    // banner printed to stderr, temp dir cleaned up
    expect(stderr).toHaveBeenCalledWith(
      expect.stringContaining("View your report"),
    );
    expect(existsSync(dir)).toBe(false);
  });

  it("logs an error when the upload fails", async () => {
    await writeRun(new Date("2026-01-01T00:00:00.000Z"), [
      { meta: { protocolVersion: "1" } },
      { testRunStarted: { id: "s1", timestamp: ts(0) } },
      { testRunFinished: { success: true, timestamp: ts(1) } },
    ]);
    const fetchMock = vi.fn((url: string, init?: RequestInit) =>
      Promise.resolve(
        init?.method === "PUT"
          ? new Response("nope", { status: 500 })
          : new Response(JSON.stringify({ banner: "b" }), {
              status: 200,
              headers: { Location: "https://reports.test/upload/1" },
            }),
      ),
    );
    vi.stubGlobal("fetch", fetchMock);
    const error = vi.spyOn(console, "error").mockReturnValue();

    await publishReport("node");

    expect(error).toHaveBeenCalledWith(
      expect.stringContaining("Failed to upload report"),
    );
    expect(existsSync(dir)).toBe(false);
  });

  it("prints the banner when the touch request is rejected", async () => {
    await writeRun(new Date("2026-01-01T00:00:00.000Z"), [
      { meta: { protocolVersion: "1" } },
      { testRunStarted: { id: "s1", timestamp: ts(0) } },
      { testRunFinished: { success: true, timestamp: ts(1) } },
    ]);
    const fetchMock = vi.fn(() =>
      Promise.resolve(
        new Response(JSON.stringify({ banner: "bad token" }), { status: 401 }),
      ),
    );
    vi.stubGlobal("fetch", fetchMock);
    const stderr = vi.spyOn(process.stderr, "write").mockReturnValue(true);

    await publishReport("node");

    expect(fetchMock).toHaveBeenCalledTimes(1); // no upload attempted
    expect(stderr).toHaveBeenCalledWith(expect.stringContaining("bad token"));
  });

  it("logs and skips on a 5xx touch response (no upload)", async () => {
    await writeRun(new Date("2026-01-01T00:00:00.000Z"), [
      { meta: { protocolVersion: "1" } },
      { testRunStarted: { id: "s1", timestamp: ts(0) } },
      { testRunFinished: { success: true, timestamp: ts(1) } },
    ]);
    const fetchMock = vi.fn(() =>
      Promise.resolve(new Response("nope", { status: 503 })),
    );
    vi.stubGlobal("fetch", fetchMock);
    const error = vi.spyOn(console, "error").mockReturnValue();

    await publishReport("node");

    expect(fetchMock).toHaveBeenCalledTimes(1); // no upload attempted
    expect(error).toHaveBeenCalledWith(
      expect.stringContaining("Failed to publish report"),
    );
  });

  it("never throws on a network error — logs instead", async () => {
    await writeRun(new Date("2026-01-01T00:00:00.000Z"), [
      { meta: { protocolVersion: "1" } },
      { testRunStarted: { id: "s1", timestamp: ts(0) } },
      { testRunFinished: { success: true, timestamp: ts(1) } },
    ]);
    const fetchMock = vi.fn(() => Promise.reject(new Error("offline")));
    vi.stubGlobal("fetch", fetchMock);
    const error = vi.spyOn(console, "error").mockReturnValue();

    await expect(publishReport("node")).resolves.toBeUndefined();

    expect(error).toHaveBeenCalledWith(
      expect.stringContaining('Failed to publish report for project "node"'),
    );
  });

  it("skips upload when the project subdir exists but has no jsonl files", async () => {
    // writeRun seeds the subdir, then we remove all files leaving it empty.
    await writeRun(new Date("2026-01-01T00:00:00.000Z"), [
      { testRunStarted: { id: "s1", timestamp: ts(0) } },
      { testRunFinished: { success: true, timestamp: ts(1) } },
    ]);
    const [sub] = readdirSync(dir);
    for (const f of readdirSync(path.join(dir, sub))) {
      rmSync(path.join(dir, sub, f));
    }
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await publishReport("node");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("skips upload when the touch response has no Location header", async () => {
    await writeRun(new Date("2026-01-01T00:00:00.000Z"), [
      { meta: { protocolVersion: "1" } },
      { testRunStarted: { id: "s1", timestamp: ts(0) } },
      { testRunFinished: { success: true, timestamp: ts(1) } },
    ]);
    // Touch succeeds (200 OK) but the service returns no Location.
    const fetchMock = vi.fn(() =>
      Promise.resolve(
        new Response(JSON.stringify({ banner: "b" }), { status: 200 }),
      ),
    );
    vi.stubGlobal("fetch", fetchMock);
    await publishReport("node");
    expect(fetchMock).toHaveBeenCalledTimes(1); // touch only, no upload
  });
});

describe("ensurePublishDir", () => {
  const originalEnv = process.env[DIR_ENV];

  afterEach(() => {
    if (originalEnv === undefined) {
      Reflect.deleteProperty(process.env, DIR_ENV);
    } else {
      process.env[DIR_ENV] = originalEnv;
    }
  });

  it("returns undefined when publish is falsy", () => {
    expect(ensurePublishDir(undefined)).toBeUndefined();
    expect(ensurePublishDir(false)).toBeUndefined();
  });

  it("creates a temp dir and returns it when publish is true", () => {
    Reflect.deleteProperty(process.env, DIR_ENV);
    const result = ensurePublishDir(true);
    expect(result).toBeTruthy();
    expect(process.env[DIR_ENV]).toBe(result);
    if (result) rmSync(result, { recursive: true, force: true });
  });

  it("is idempotent — repeated calls return the same dir", () => {
    Reflect.deleteProperty(process.env, DIR_ENV);
    const first = ensurePublishDir(true);
    const second = ensurePublishDir(true);
    expect(first).toBe(second);
    if (first) rmSync(first, { recursive: true, force: true });
  });
});
