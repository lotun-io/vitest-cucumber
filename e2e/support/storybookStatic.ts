// Storybook's preview of a scenario's project (`../steps/storybook.ts`), in a static build (`storybook
// build`, in a process of its own: with `VITEST` set, a build's plugins act as in Vitest, served from
// the build by Vite's preview server) or Storybook's dev server (`storybook dev`, in a process of
// its own, on a free port), and each story read in Storybook's UI by
// Playwright (in the run's shared Chromium: `./chromium.ts`): its Interactions panel's status (PASS or FAIL) and its
// text, or the preview's error screen.
import { spawn, spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { createServer as createNetServer } from "node:net";
import path from "node:path";
import {
  chromium as playwrightChromium,
  type Browser,
  type Page,
} from "playwright";
import { preview } from "vite";
import { inject } from "vitest";
import type {} from "./chromium.ts";
import { shellEnv } from "./shellEnv.ts";

let browser: Promise<Browser> | undefined;

/** The run's shared Chromium (`./chromium.ts`), connected to once per worker. */
export const chromium = () =>
  (browser ??= playwrightChromium.connect(inject("e2eChromium")));

/** Disconnects from the shared Chromium, if connected (`./world.ts`'s `AfterAll`). */
export const closeStaticBrowser = async () => {
  const connected = browser;
  browser = undefined;
  await (await connected)?.close();
};

/**
 * Storybook's CLI as the project has it: Node running its bin script (`.bin/storybook` is a `.cmd`
 * on Windows, which `spawn` can't run without a shell).
 */
const storybookCli = (dir: string, args: string[]): [string, string[]] => {
  const packageDir = path.join(dir, "node_modules/storybook");
  const { bin } = JSON.parse(
    readFileSync(path.join(packageDir, "package.json"), "utf8"),
  ) as { bin: string | Record<string, string> };
  const script = typeof bin === "string" ? bin : (bin.storybook ?? "");
  return [process.execPath, [path.join(packageDir, script), ...args]];
};

/** Builds the project's preview to `storybook-static/`: the build's exit code and output. */
export const build = (dir: string) =>
  new Promise<{ exitCode: number; output: string }>((resolve, reject) => {
    let output = "";
    const child = spawn(
      ...storybookCli(dir, [
        "build",
        "--quiet",
        "--output-dir",
        "storybook-static",
      ]),
      { cwd: dir, env: shellEnv(), windowsHide: true },
    );
    child.stdout.on("data", (chunk: Buffer) => (output += chunk.toString()));
    child.stderr.on("data", (chunk: Buffer) => (output += chunk.toString()));
    child.on("error", reject);
    child.on("exit", (code) => {
      resolve({ exitCode: code ?? 1, output });
    });
  });

/** A free port on the loopback interface. */
const freePort = () =>
  new Promise<number>((resolve, reject) => {
    const server = createNetServer();
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : 0;
      server.close(() => resolve(port));
    });
  });

/**
 * Starts Storybook's dev server for the project (`storybook dev`): its URL once its index answers
 * (60 s at most), and how to stop it (its process group).
 */
/**
 * The process groups of the `storybook dev` servers this worker started and hasn't stopped: killed
 * as the worker exits, should a scenario's cleanup not have run (each has a session of its own, so
 * nothing else would stop it).
 */
const devGroups = new Set<number>();
process.on("exit", () => {
  for (const group of devGroups) {
    try {
      process.kill(-group, "SIGKILL");
    } catch {
      // Gone already.
    }
  }
});

export const startDev = async (dir: string) => {
  const port = await freePort();
  const url = `http://127.0.0.1:${String(port)}`;
  let output = "";
  const child = spawn(
    ...storybookCli(dir, [
      "dev",
      "--ci",
      "--no-open",
      "--quiet",
      "-p",
      String(port),
      "--host",
      "127.0.0.1",
    ]),
    // Its own process group, stopped whole (on Windows: its process tree, by `taskkill`).
    {
      cwd: dir,
      env: shellEnv(),
      detached: process.platform !== "win32",
      windowsHide: true,
    },
  );
  child.stdout.on("data", (chunk: Buffer) => (output += chunk.toString()));
  child.stderr.on("data", (chunk: Buffer) => (output += chunk.toString()));
  const exited = new Promise<void>((resolve) => {
    child.once("exit", () => {
      resolve();
    });
  });
  const { pid } = child;
  if (pid !== undefined && process.platform !== "win32") {
    devGroups.add(pid);
  }
  /** Stops the server's whole process group: SIGTERM, then SIGKILL for what's left after 5 s. */
  const close = async () => {
    if (pid === undefined) {
      return;
    }
    if (process.platform === "win32") {
      if (child.exitCode === null) {
        spawnSync("taskkill", ["/T", "/F", "/PID", String(pid)]);
        // Its files let go as it exits: the scenario's folder is removed next.
        await Promise.race([
          exited,
          new Promise((resolve) => setTimeout(resolve, 5000)),
        ]);
      }
      return;
    }
    // Once only (`After` and a failed start may both ask).
    if (!devGroups.delete(pid)) {
      return;
    }
    const signal = (name: NodeJS.Signals) => {
      try {
        process.kill(-pid, name);
      } catch {
        // The group is gone.
      }
    };
    signal("SIGTERM");
    await Promise.race([
      exited,
      new Promise((resolve) => setTimeout(resolve, 5000)),
    ]);
    // Whatever of the group outlived its leader, or the leader itself if it didn't stop.
    signal("SIGKILL");
  };
  const started = Date.now();
  while (Date.now() - started < 60_000) {
    if (child.exitCode !== null) {
      throw new Error(
        `storybook dev exited (${String(child.exitCode)}):\n${output}`,
      );
    }
    const ready = await fetch(`${url}/index.json`).then(
      (response) => response.ok,
      () => false,
    );
    if (ready) {
      return { url, close };
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  await close();
  throw new Error(`storybook dev didn't start in 60 s:\n${output}`);
};

/**
 * Serves `root` (a static build) on a free port, with Vite's preview server (not the scenario's own
 * Vite config: its plugins are Storybook's): its URL, and the server to close.
 */
export const serve = async (root: string) => {
  const server = await preview({
    configFile: false,
    root,
    build: { outDir: root },
    preview: { host: "127.0.0.1", port: 0, strictPort: true, open: false },
    logLevel: "silent",
  });
  const address = server.httpServer.address();
  const port = typeof address === "object" && address ? address.port : 0;
  return { url: `http://127.0.0.1:${String(port)}`, server };
};

/** The panel's status, as its badge reads ("Story status: Pass"): "PASS", "FAIL", "RUNS", … */
const statusOf = (page: Page) =>
  page
    .locator('[aria-label^="Story status:"]')
    .first()
    .textContent({ timeout: 100 })
    .then((text) => text?.trim().toUpperCase())
    .catch(() => undefined);

/** The panel's text. */
const panelOf = (page: Page) =>
  page
    .locator('[role="tabpanel"]')
    .allInnerTexts()
    .then((texts) => texts.join("\n"));

/** The preview's error screen's text (a story that couldn't load), if it shows. */
const errorScreenOf = async (page: Page) => {
  const frame = page.frameLocator("#storybook-preview-iframe");
  const shown = await frame
    .locator("body.sb-show-errordisplay")
    .count()
    .catch(() => 0);
  return shown > 0
    ? frame.locator("#error-message, #error-stack").allInnerTexts()
    : undefined;
};

/** Opens `story` in Storybook's UI, its Interactions panel open, until its play ended (15 s at most). */
export const readStory = async (page: Page, url: string, story: string) => {
  await page.goto(
    `${url}/index.html?path=/story/${story}&addonPanel=storybook/interactions/panel`,
  );
  const started = Date.now();
  while (Date.now() - started < 15_000) {
    const status = await statusOf(page);
    if (status === "PASS" || status === "FAIL") {
      return { status, panel: await panelOf(page) };
    }
    const error = await errorScreenOf(page);
    if (error) {
      return { status: "FAIL", panel: error.join("\n") };
    }
    await page.waitForTimeout(50);
  }
  return {
    status: "TIMEOUT",
    panel: `${story} didn't end in 15 s:\n${await panelOf(page)}`,
  };
};
