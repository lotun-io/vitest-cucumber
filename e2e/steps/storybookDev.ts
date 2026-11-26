// `storybook dev` on a scenario's Storybook project (`When I start its Storybook dev server`:
// `./storybook.ts`), a page of its preview open (the preview's own page, `iframe.html`, in the
// run's shared Chromium): files saved or deleted while it runs, and what the page shows, whether
// it reloaded, what Storybook's index has and which files have a new time, each waited for (the
// dev server answers a save in its own time).
import { Then, When } from "@cucumber/cucumber";
import { readFile, rm, stat, writeFile } from "node:fs/promises";
import { glob } from "tinyglobby";
import { expect } from "vitest";
import { chromium } from "../support/storybookStatic.ts";
import type { E2EWorld } from "../support/world.ts";

/** How long a step waits for what it expects (a cold dev server's first page takes the longest). */
const patience = 45_000;
const timeout = patience + 15_000;

/** The scenario's dev server (`When I start its Storybook dev server`). */
const devOf = (world: E2EWorld) => {
  if (!world.storybookDev) {
    throw new Error(
      "Storybook's dev server isn't running: add a `When I start its Storybook dev server` step",
    );
  }
  return world.storybookDev;
};

/** The scenario's open page (`When I open its story {string}`). */
const pageOf = (world: E2EWorld) => {
  if (!world.storybookPage) {
    throw new Error(
      'No page is open: add a `When I open its story "<id>"` step',
    );
  }
  return world.storybookPage;
};

/** Waits until `read` gives what `accepts` (at most `patience`): its last answer. */
const eventually = async <T>(
  read: () => Promise<T>,
  accepts: (value: T) => boolean,
) => {
  const started = Date.now();
  let value = await read();
  while (!accepts(value) && Date.now() - started < patience) {
    await new Promise((resolve) => setTimeout(resolve, 100));
    value = await read();
  }
  return value;
};

/** The project's files (all but its `node_modules`), each with its time. */
const timesOf = async (dir: string) => {
  const names = await glob("**/*", {
    cwd: dir,
    dot: true,
    ignore: ["node_modules/**"],
  });
  return new Map(
    await Promise.all(
      names.map(
        async (name) => [name, (await stat(`${dir}/${name}`)).mtimeMs] as const,
      ),
    ),
  );
};

/** When each scenario last saved or deleted a file. */
const saved = new WeakMap<E2EWorld, number>();

/**
 * How long after a save a reload it causes may still come: the page reloads ~0.1 s after one that
 * reloads it (84 ms, measured 2026-11-26 on the support code's module), waited for six times over.
 */
const settle = 500;

// A story's own page (the preview's, as Storybook's UI frames it), kept open for the scenario: its
// reloads counted from here, and the project's files' times as they are now.
When(
  "I open its story {string}",
  { timeout },
  async function (this: E2EWorld, story: string) {
    const page = await (await chromium()).newPage();
    const loads = { count: 0 };
    await page.goto(
      `${devOf(this).url}/iframe.html?id=${story}&viewMode=story`,
    );
    page.on("load", () => {
      loads.count += 1;
    });
    this.storybookPage = { page, loads };
    this.fileTimes = await timesOf(this.dir);
  },
);

When(
  "I save the file {string} with:",
  async function (this: E2EWorld, name: string, content: string) {
    this.fileTimes ??= await timesOf(this.dir);
    await writeFile(this.file(name), content);
    saved.set(this, Date.now());
  },
);

// Each of a `'…'` or `"…"` text: the file's text with the first replaced by the second.
When(
  /^I save the file "([^"]+)" replacing (?:"([^"]*)"|'([^']*)') with (?:"([^"]*)"|'([^']*)')$/,
  async function (
    this: E2EWorld,
    name: string,
    fromDouble: string | undefined,
    fromSingle: string | undefined,
    toDouble: string | undefined,
    toSingle: string | undefined,
  ) {
    const from = fromDouble ?? fromSingle ?? "";
    const text = await readFile(this.file(name), "utf8");
    expect(text, name).toContain(from);
    this.fileTimes ??= await timesOf(this.dir);
    await writeFile(
      this.file(name),
      text.replace(from, toDouble ?? toSingle ?? ""),
    );
    saved.set(this, Date.now());
  },
);

When(
  "I delete the file {string}",
  async function (this: E2EWorld, name: string) {
    this.fileTimes ??= await timesOf(this.dir);
    await rm(this.file(name));
    saved.set(this, Date.now());
  },
);

/** The open page's text (none while it's loading). */
const textOf = (world: E2EWorld) =>
  pageOf(world)
    .page.locator("body")
    .innerText({ timeout: 1000 })
    .catch(() => "");

Then(
  "its page shows {string}",
  { timeout },
  async function (this: E2EWorld, text: string) {
    expect(
      await eventually(
        () => textOf(this),
        (shown) => shown.includes(text),
      ),
    ).toContain(text);
  },
);

Then(
  "its page no longer shows {string}",
  { timeout },
  async function (this: E2EWorld, text: string) {
    expect(
      await eventually(
        () => textOf(this),
        (shown) => !shown.includes(text),
      ),
    ).not.toContain(text);
  },
);

// Not before a reload the last save causes would have come (`settle`).
Then("its page didn't reload", async function (this: E2EWorld) {
  const wait = (saved.get(this) ?? 0) + settle - Date.now();
  if (wait > 0) {
    await new Promise((resolve) => setTimeout(resolve, wait));
  }
  expect(pageOf(this).loads.count).toBe(0);
});

Then("its page reloaded", function (this: E2EWorld) {
  expect(pageOf(this).loads.count).toBeGreaterThan(0);
});

/** The ids of Storybook's index's entries (none while it can't be made). */
const indexOf = async (world: E2EWorld) => {
  const response = await fetch(`${devOf(world).url}/index.json`).catch(
    () => undefined,
  );
  if (!response?.ok) {
    return [];
  }
  const index = (await response.json()) as { entries: Record<string, unknown> };
  return Object.keys(index.entries);
};

Then(
  "its index has the story {string}",
  { timeout },
  async function (this: E2EWorld, story: string) {
    expect(
      await eventually(
        () => indexOf(this),
        (ids) => ids.includes(story),
      ),
    ).toContain(story);
  },
);

Then(
  "its index has no story {string}",
  { timeout },
  async function (this: E2EWorld, story: string) {
    expect(
      await eventually(
        () => indexOf(this),
        (ids) => !ids.includes(story),
      ),
    ).not.toContain(story);
  },
);

// Since the page was opened, the scenario's first save, or this step last: the files with another
// time, or new.
Then(
  "no file but {string} has a new time",
  async function (this: E2EWorld, name: string) {
    const before = this.fileTimes ?? new Map<string, number>();
    const now = await timesOf(this.dir);
    this.fileTimes = now;
    expect(
      [...now].flatMap(([file, time]) =>
        time === before.get(file) ? [] : [file],
      ),
    ).toEqual([name]);
  },
);
