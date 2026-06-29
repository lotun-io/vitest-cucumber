import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { TestProject } from "vitest/node";
import { setup } from "../publishGlobalSetup.ts";

const DIR_ENV = "VITEST_CUCUMBER_PUBLISH_DIR";

// `setup(project)` returns the teardown bound to the project's name.
const teardownFor = (name: string) => setup({ name } as TestProject);

describe("publishGlobalSetup", () => {
  const original = process.env[DIR_ENV];

  afterEach(() => {
    vi.unstubAllGlobals();
    if (original === undefined) {
      Reflect.deleteProperty(process.env, DIR_ENV);
    } else {
      process.env[DIR_ENV] = original;
    }
  });

  it("teardown is a no-op when no publish dir is set", async () => {
    Reflect.deleteProperty(process.env, DIR_ENV);
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await teardownFor("node")();

    // publishReport reads no dir from env → never runs → no fetch
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("teardown is a no-op when the project wrote nothing", async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "vc-gsetup-"));
    process.env[DIR_ENV] = dir;
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    // no envelopes were written, so this project's subdir doesn't exist and
    // publishReport returns before any network call.
    await teardownFor("node")();
    expect(fetchMock).not.toHaveBeenCalled();

    rmSync(dir, { recursive: true, force: true });
  });
});
