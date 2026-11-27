// A scenario's own Storybook project (`../support/storybookProject.ts`: its files, `.storybook/`, its
// `node_modules` `storybook/`'s): its story tests run as any run (`When I run vitest`, the
// `storybook` mode), its preview built (`storybook build`) and read in Storybook's UI by Playwright
// (`../support/storybookStatic.ts`), each story's status and the texts its Interactions panel shows,
// compared with what a table says.
import type { DataTable } from "@cucumber/cucumber";
import { Given, Then, When } from "@cucumber/cucumber";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { expect } from "vitest";
import { slash } from "../support/paths.ts";
import { writeDefaultConfig } from "../support/project.ts";
import {
  featureStoriesFiles,
  withOwnPackages,
} from "../support/storybookProject.ts";
import {
  build,
  chromium,
  readStory,
  serve,
  startDev,
} from "../support/storybookStatic.ts";
import type { E2EWorld } from "../support/world.ts";

// The default config's `storybook` mode: the scenario's project a Storybook project.
Given("a Storybook project", (world: E2EWorld) => {
  return writeDefaultConfig.call(world, "storybook");
});

/** Builds the project's preview (`storybook build`): its result. */
async function buildStorybook(this: E2EWorld) {
  await featureStoriesFiles.call(this);
  await withOwnPackages.call(this);
  return build(this.dir);
}

When("I build its Storybook", { timeout: 120_000 }, async (world: E2EWorld) => {
  const { exitCode, output } = await buildStorybook.call(world);
  expect(exitCode, output).toBe(0);
});

/**
 * A static build is published: no path of the machine that built it in any of its files. The
 * repository's folder (the scenario's project is inside it, the plugin too), as Node writes it,
 * with `/`, and as JSON writes it (Windows' `\` doubled).
 */
Then(
  "its built files have no path of this machine",
  async (world: E2EWorld) => {
    const out = path.join(world.dir, "storybook-static");
    const root = path.resolve();
    const forms = [
      ...new Set([root, slash(root), JSON.stringify(root).slice(1, -1)]),
    ];
    const found: string[] = [];
    for (const entry of await readdir(out, {
      recursive: true,
      withFileTypes: true,
    })) {
      if (entry.isFile()) {
        const file = path.join(entry.parentPath, entry.name);
        const text = await readFile(file, "utf8");
        if (forms.some((form) => text.includes(form))) {
          found.push(slash(path.relative(out, file)));
        }
      }
    }
    expect(found).toEqual([]);
  },
);

// A build Storybook stops (a broken stories file, or feature file: its index fails), its output with
// each line of `text` (Storybook's printer wraps a message's lines, each in its frame: `│`, `|` on
// Windows).
Then(
  "building its Storybook fails with:",
  { timeout: 120_000 },
  async (world: E2EWorld, text: string) => {
    const { exitCode, output } = await buildStorybook.call(world);
    expect(exitCode, output).not.toBe(0);
    for (const line of text.split("\n")) {
      expect(output).toContain(line);
    }
  },
);

When(
  "I start its Storybook dev server",
  { timeout: 120_000 },
  async (world: E2EWorld) => {
    await featureStoriesFiles.call(world);
    await withOwnPackages.call(world);
    world.storybookDev = await startDev(world.dir);
  },
);

// As from a monorepo's root: `storybook dev` started in the folder above the project, its config
// folder named (`--config-dir`). Storybook names each file from where it runs (`./<project>/src/…`).
When(
  "I start its Storybook dev server from the folder above",
  { timeout: 120_000 },
  async (world: E2EWorld) => {
    await featureStoriesFiles.call(world);
    await withOwnPackages.call(world);
    world.storybookDev = await startDev(world.dir, path.dirname(world.dir));
  },
);

// The preview the scenario built or started (`storybook dev`): one row per text: a story's id (`STORY`), its `STATUS` (PASS or FAIL), a text its panel `SHOWS`, and
// one it `HIDES` (none if empty).
Then(
  "its stories show:",
  { timeout: 120_000 },
  async (world: E2EWorld, table: DataTable) => {
    const stories = new Map<string, Record<string, string>[]>();
    for (const row of table.hashes()) {
      const story = row.STORY ?? "";
      stories.set(story, [...(stories.get(story) ?? []), row]);
    }
    // The dev server's, if the scenario started one, else the static build's.
    const { url, server } = world.storybookDev
      ? { url: world.storybookDev.url, server: undefined }
      : await serve(path.join(world.dir, "storybook-static"));
    const page = await (
      await chromium()
    ).newPage({
      viewport: { width: 1400, height: 1000 },
    });
    try {
      for (const [story, rows] of stories) {
        const { status, panel } = await readStory(page, url, story);
        for (const { STATUS, SHOWS = "", HIDES } of rows) {
          expect(status, `${story}\n${panel}`).toBe(STATUS);
          expect(panel, story).toContain(SHOWS);
          if (HIDES) {
            expect(panel, story).not.toContain(HIDES);
          }
        }
      }
    } finally {
      await page.close();
      await server?.close();
    }
  },
);

/** An index entry's title, name and tags (Storybook's `index.json`). */
interface IndexEntry {
  title: string;
  name: string;
  tags?: string[];
}

/** Storybook's index (the dev server's, if the scenario started one, else the static build's): its entries, by id. */
async function indexEntries(this: E2EWorld) {
  const text = this.storybookDev
    ? await (await fetch(`${this.storybookDev.url}/index.json`)).text()
    : await readFile(
        path.join(this.dir, "storybook-static/index.json"),
        "utf8",
      );
  const { entries }: { entries: Record<string, IndexEntry | undefined> } =
    JSON.parse(text);
  return entries;
}

// Storybook's index: one row per story, its id (`STORY`), its `TITLE` (its place in the sidebar)
// and its `NAME`.
Then("its index lists:", async (world: E2EWorld, table: DataTable) => {
  const entries = await indexEntries.call(world);
  expect(
    table.hashes().map(({ STORY = "" }) => {
      const entry = entries[STORY];
      return { STORY, TITLE: entry?.title, NAME: entry?.name };
    }),
  ).toEqual(table.hashes());
});

// Storybook's index: one row per story, its id (`STORY`) and whether it has Storybook's own `DEV`
// tag (it's listed in the sidebar) and `TEST` tag (the Vitest addon runs it): `yes` or `no`.
Then("its index tags:", async (world: E2EWorld, table: DataTable) => {
  const entries = await indexEntries.call(world);
  const has = (story: string, tag: string) =>
    entries[story]?.tags?.includes(tag) ? "yes" : "no";
  expect(
    table.hashes().map(({ STORY = "" }) => ({
      STORY,
      DEV: has(STORY, "dev"),
      TEST: has(STORY, "test"),
    })),
  ).toEqual(table.hashes());
});
