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

/** When each scenario last saved or deleted a file, and its page's loads then. */
const saved = new WeakMap<E2EWorld, { at: number; loads: number }>();

/** A file saved or deleted now: its time, and how many times the page had loaded by then. */
const markSaved = (world: E2EWorld) => {
  saved.set(world, {
    at: Date.now(),
    loads: world.storybookPage?.loads.count ?? 0,
  });
};

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
  async (world: E2EWorld, story: string) => {
    const page = await (await chromium()).newPage();
    const loads = { count: 0 };
    await page.goto(
      `${devOf(world).url}/iframe.html?id=${story}&viewMode=story`,
    );
    page.on("load", () => {
      loads.count += 1;
    });
    world.storybookPage = { page, loads };
    world.fileTimes = await timesOf(world.dir);
  },
);

When(
  "I save the file {string} with:",
  async (world: E2EWorld, name: string, content: string) => {
    world.fileTimes ??= await timesOf(world.dir);
    await writeFile(world.file(name), content);
    markSaved(world);
  },
);

// Each of a `'…'` or `"…"` text: the file's text with the first replaced by the second.
When(
  /^I save the file "([^"]+)" replacing (?:"([^"]*)"|'([^']*)') with (?:"([^"]*)"|'([^']*)')$/,
  async (
    world: E2EWorld,
    name: string,
    fromDouble: string | undefined,
    fromSingle: string | undefined,
    toDouble: string | undefined,
    toSingle: string | undefined,
  ) => {
    const from = fromDouble ?? fromSingle ?? "";
    const text = await readFile(world.file(name), "utf8");
    expect(text, name).toContain(from);
    world.fileTimes ??= await timesOf(world.dir);
    await writeFile(
      world.file(name),
      text.replace(from, toDouble ?? toSingle ?? ""),
    );
    markSaved(world);
  },
);

When("I delete the file {string}", async (world: E2EWorld, name: string) => {
  world.fileTimes ??= await timesOf(world.dir);
  await rm(world.file(name));
  markSaved(world);
});

/** The open page's text (none while it's loading). */
const textOf = (world: E2EWorld) =>
  pageOf(world)
    .page.locator("body")
    .innerText({ timeout: 1000 })
    .catch(() => "");

/**
 * The open page as it is: whether it shows a story (Storybook's preview marks its `<body>`
 * `sb-show-main`; else it's preparing one, or shows Storybook's error or no preview), and its text.
 */
const stateOf = async (world: E2EWorld) => ({
  shown: await pageOf(world)
    .page.locator("body")
    .getAttribute("class", { timeout: 1000 })
    .then((classes) => (classes ?? "").split(" ").includes("sb-show-main"))
    .catch(() => false),
  text: await textOf(world),
});

Then(
  "its page shows {string}",
  { timeout },
  async (world: E2EWorld, text: string) => {
    // On a page that shows a story: Storybook's error screen may quote the text too.
    const state = await eventually(
      () => stateOf(world),
      ({ shown, text: shownText }) => shown && shownText.includes(text),
    );
    expect(state.text).toContain(text);
    expect(
      state.shown,
      `the page shows no story (Storybook's error, or still loading):\n${state.text}`,
    ).toBe(true);
  },
);

// On a page that shows a story: a blank page, one still loading or Storybook's error shows no text.
Then(
  "its page no longer shows {string}",
  { timeout },
  async (world: E2EWorld, text: string) => {
    const state = await eventually(
      () => stateOf(world),
      ({ shown, text: shownText }) => shown && !shownText.includes(text),
    );
    expect(
      state.shown,
      `the page shows no story (loading, blank or Storybook's error):\n${state.text}`,
    ).toBe(true);
    expect(state.text).not.toContain(text);
  },
);

// Not before a reload the last save causes would have come (`settle`).
// Since the last save (or since it was opened): not before a reload it causes would have come.
Then("its page didn't reload", async (world: E2EWorld) => {
  const last = saved.get(world);
  const wait = (last?.at ?? 0) + settle - Date.now();
  if (wait > 0) {
    await new Promise((resolve) => setTimeout(resolve, wait));
  }
  expect(pageOf(world).loads.count).toBe(last?.loads ?? 0);
});

// Since the last save: a reload it caused, waited for (an earlier one isn't it).
Then("its page reloaded", { timeout }, async (world: E2EWorld) => {
  const before = saved.get(world)?.loads ?? 0;
  expect(
    await eventually(
      () => Promise.resolve(pageOf(world).loads.count),
      (count) => count > before,
    ),
  ).toBeGreaterThan(before);
});

/** The ids of Storybook's index's entries, or why it can't be made (its status, its text). */
const indexOf = async (
  world: E2EWorld,
): Promise<{ ids: string[] } | { failed: string }> => {
  const response = await fetch(`${devOf(world).url}/index.json`).catch(
    (error: unknown) => String(error),
  );
  if (typeof response === "string") {
    return { failed: response };
  }
  if (!response.ok) {
    return {
      failed: `${String(response.status)}: ${await response.text()}`,
    };
  }
  const index = (await response.json()) as { entries: Record<string, unknown> };
  return { ids: Object.keys(index.entries) };
};

/** An index's ids, its failure said (the step's own error). */
const idsOf = (index: Awaited<ReturnType<typeof indexOf>>) => {
  if ("failed" in index) {
    throw new Error(`Storybook's index couldn't be made (${index.failed})`);
  }
  return index.ids;
};

Then(
  "its index has the story {string}",
  { timeout },
  async (world: E2EWorld, story: string) => {
    expect(
      idsOf(
        await eventually(
          () => indexOf(world),
          (index) => "ids" in index && index.ids.includes(story),
        ),
      ),
    ).toContain(story);
  },
);

Then(
  "its index has no story {string}",
  { timeout },
  async (world: E2EWorld, story: string) => {
    // An index that was made: one that can't be has no story either.
    expect(
      idsOf(
        await eventually(
          () => indexOf(world),
          (index) => "ids" in index && !index.ids.includes(story),
        ),
      ),
    ).not.toContain(story);
  },
);

// Since the page was opened, the scenario's first save, or this step last: the files with another
// time, or new.
Then(
  "no file but {string} has a new time",
  async (world: E2EWorld, name: string) => {
    const before = world.fileTimes ?? new Map<string, number>();
    const now = await timesOf(world.dir);
    world.fileTimes = now;
    expect(
      [...now].flatMap(([file, time]) =>
        time === before.get(file) ? [] : [file],
      ),
    ).toEqual([name]);
  },
);
