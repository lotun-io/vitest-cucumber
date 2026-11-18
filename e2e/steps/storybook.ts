// A scenario's own Storybook project (`../support/storybookProject.ts`: its files, `.storybook/`, its
// `node_modules` `storybook/`'s): its story tests run as any run (`When I run vitest`, the
// `storybook` mode), its preview built (`storybook build`) and read in Storybook's UI by Playwright
// (`../support/storybookStatic.ts`), each story's status and the texts its Interactions panel shows,
// compared with what a table says.
import type { DataTable } from "@cucumber/cucumber";
import { Given, Then, When } from "@cucumber/cucumber";
import path from "node:path";
import { expect } from "vitest";
import { writeDefaultConfig } from "../support/project.ts";
import { featureStoriesFiles } from "../support/storybookProject.ts";
import {
  build,
  chromium,
  readStory,
  serve,
  startDev,
} from "../support/storybookStatic.ts";
import type { E2EWorld } from "../support/world.ts";

// The default config's `storybook` mode: the scenario's project a Storybook project.
Given("a Storybook project", function (this: E2EWorld) {
  return writeDefaultConfig.call(this, "storybook");
});

/** Builds the project's preview (`storybook build`): its result, the scenario's (`storybookBuild`). */
async function buildStorybook(this: E2EWorld) {
  await featureStoriesFiles.call(this);
  this.storybookBuild = await build(this.dir);
  return this.storybookBuild;
}

When(
  "I build its Storybook",
  { timeout: 120_000 },
  async function (this: E2EWorld) {
    const { exitCode, output } = await buildStorybook.call(this);
    expect(exitCode, output).toBe(0);
  },
);

// A build Storybook stops (a broken stories file, or feature file: its index fails), its output with
// each line of `text` (Storybook's printer wraps a message's lines, each in its frame: `│`, `|` on
// Windows).
Then(
  "building its Storybook fails with:",
  { timeout: 120_000 },
  async function (this: E2EWorld, text: string) {
    const { exitCode, output } = await buildStorybook.call(this);
    expect(exitCode, output).not.toBe(0);
    for (const line of text.split("\n")) {
      expect(output).toContain(line);
    }
  },
);

When(
  "I start its Storybook dev server",
  { timeout: 120_000 },
  async function (this: E2EWorld) {
    await featureStoriesFiles.call(this);
    this.storybookDev = await startDev(this.dir);
  },
);

// The preview the scenario built or started (`storybook dev`): one row per text: a story's id (`STORY`), its `STATUS` (PASS or FAIL), a text its panel `SHOWS`, and
// one it `HIDES` (none if empty).
Then(
  "its stories show:",
  { timeout: 120_000 },
  async function (this: E2EWorld, table: DataTable) {
    const stories = new Map<string, Record<string, string>[]>();
    for (const row of table.hashes()) {
      const story = row.STORY ?? "";
      stories.set(story, [...(stories.get(story) ?? []), row]);
    }
    // The dev server's, if the scenario started one, else the static build's.
    const { url, server } = this.storybookDev
      ? { url: this.storybookDev.url, server: undefined }
      : await serve(path.join(this.dir, "storybook-static"));
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
