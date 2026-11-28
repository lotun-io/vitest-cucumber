import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, expect, test } from "vitest";
import { pluginError } from "../../../utils/errors.ts";
import { slash } from "../../../utils/slash.ts";
import { configurationOf } from "../../plugin/options.ts";
import { createFeaturePlans, failedPlan } from "../plans.ts";

const root = mkdtempSync(path.join(tmpdir(), "plans-"));
afterAll(() => {
  rmSync(root, { recursive: true, force: true });
});

const file = (name: string, content: string) => {
  const id = slash(path.join(root, name));
  mkdirSync(path.dirname(id), { recursive: true });
  writeFileSync(id, content);
  return id;
};

/** The project's feature plans; its support code the `support` folder's (`import`). */
const plans = () =>
  createFeaturePlans({
    root: () => root,
    configuration: configurationOf({ import: ["support"] }),
  });

const tagged = "@smoke\nFeature: A\n  @one\n  Scenario: s\n    Given a step\n";

test("tagsPlanOf: a feature file's uri and tags", async () => {
  const id = file("a.feature", tagged);
  expect(await plans().tagsPlanOf(id)).toEqual({
    uri: "a.feature",
    tags: ["@smoke", "@one"],
  });
});

test("vitestPlanOf: the file is read once, its plan from that reading until its event or the cache's clear()", async () => {
  const id = file("b.feature", tagged);
  const all = plans();
  const plan = await all.vitestPlanOf(id);
  expect(plan).toMatchObject({
    uri: "b.feature",
    tags: ["@smoke", "@one"],
    options: {},
  });
  expect("error" in plan ? [] : plan.gherkin.pickles).toHaveLength(1);
  expect(await all.fileOf(id)).toMatchObject({ content: tagged });
  // Put together again at each ask, from the same parts: its parse the same object.
  const again = await all.vitestPlanOf(id);
  expect(again).toEqual(plan);
  expect("error" in again || "error" in plan || again.gherkin).toBe(
    "error" in plan || plan.gherkin,
  );
  // Changed on disk, nothing said: what was read.
  writeFileSync(id, tagged.replace("@one", "@two"));
  expect(await all.vitestPlanOf(id)).toEqual(plan);
  expect(await all.tagsPlanOf(id)).toMatchObject({ tags: ["@smoke", "@one"] });
  // Its event: read again, nothing left for the host.
  expect(await all.onFileChange("change", id)).toEqual({
    supportFilesChanged: false,
  });
  const changed = await all.vitestPlanOf(id);
  expect(changed).toMatchObject({ tags: ["@smoke", "@two"] });
  expect(await all.tagsPlanOf(id)).toMatchObject({ tags: ["@smoke", "@two"] });
  // Changed again, then the cache cleared (a run's start): read again.
  writeFileSync(id, tagged);
  expect(await all.vitestPlanOf(id)).toEqual(changed);
  all.cache.clear();
  expect(await all.vitestPlanOf(id)).toMatchObject({
    tags: ["@smoke", "@one"],
  });
});

test("the support files are listed once: one added or removed is seen at its event (the list another: the host's to follow), or after clear()", async () => {
  const id = file("d.feature", tagged);
  const other = file("d2.feature", tagged);
  const all = plans();
  // Never listed: nothing was made with a list.
  expect(await all.onFileChange("add", path.join(root, "x.ts"))).toEqual({
    supportFilesChanged: false,
  });
  const plan = await all.vitestPlanOf(id);
  expect(plan).toMatchObject({ options: {}, supportFiles: [] });
  expect(await all.supportFiles()).toEqual([]);
  // Added, nothing said: the list as read, for every feature file.
  const added = file("support/steps.ts", "");
  expect(await all.vitestPlanOf(id)).toEqual(plan);
  expect(await all.vitestPlanOf(other)).toMatchObject({ supportFiles: [] });
  expect(await all.onFileChange("add", added)).toEqual({
    supportFilesChanged: true,
  });
  // The plan with the new list; the one made before is as it was.
  expect(await all.vitestPlanOf(id)).toMatchObject({ supportFiles: [added] });
  expect(plan).toMatchObject({ supportFiles: [] });
  // Another file added, a support file changed: the same list.
  expect(await all.onFileChange("add", path.join(root, "x.ts"))).toEqual({
    supportFilesChanged: false,
  });
  expect(await all.onFileChange("change", added)).toEqual({
    supportFilesChanged: false,
  });
  // Removed, nothing said, then the cache cleared (a run's start, no watcher): listed again.
  rmSync(added);
  expect(await all.vitestPlanOf(id)).toMatchObject({ supportFiles: [added] });
  all.cache.clear();
  expect(await all.vitestPlanOf(id)).toMatchObject({ supportFiles: [] });
  // Its event after that: the list as last read before it is the same.
  expect(await all.onFileChange("unlink", added)).toEqual({
    supportFilesChanged: false,
  });
  // One removed, its event: another list.
  file("support/steps.ts", "");
  await all.onFileChange("add", added);
  rmSync(added);
  expect(await all.onFileChange("unlink", added)).toEqual({
    supportFilesChanged: true,
  });
});

test("nothing of Storybook here: a stories file's event is any other file's", async () => {
  const all = plans();
  await all.supportFiles();
  const storiesFile = file("src/Page.stories.ts", "not even a module {");
  for (const type of ["add", "change", "unlink"] as const) {
    expect(await all.onFileChange(type, storiesFile)).toEqual({
      supportFilesChanged: false,
    });
  }
});

test("a file that doesn't parse is a failed plan, the same one while its text is, with no tags", async () => {
  const id = file("broken.feature", "@tag\nNot Gherkin\n");
  const all = plans();
  const plan = await all.vitestPlanOf(id);
  expect(plan).toMatchObject({
    error: {
      message: [
        "[@lotun/vitest-cucumber] feature file can't be parsed",
        "  - expected: #TagLine, #FeatureLine, #Comment, #Empty, got 'Not Gherkin'",
        "    broken.feature:2:1",
        "  - unexpected end of file, expected: #TagLine, #FeatureLine, #Comment, #Empty",
        "    broken.feature:3",
      ].join("\n"),
    },
  });
  expect(plan).not.toHaveProperty("tags");
  expect(await all.vitestPlanOf(id)).toBe(plan);
});

test("nothing throws: a file that can't be read is a failed plan, the file's own error, Node's reason without its path; created: its event", async () => {
  const all = plans();
  const id = path.join(root, "missing.feature");
  for (const plan of [await all.tagsPlanOf(id), await all.vitestPlanOf(id)]) {
    expect(plan).toMatchObject({
      error: {
        message: [
          "[@lotun/vitest-cucumber] feature file can't be read (ENOENT: no such file or directory)",
          "  missing.feature",
        ].join("\n"),
        stack: "",
      },
    });
  }
  file("missing.feature", tagged);
  await all.onFileChange("add", id);
  expect(await all.vitestPlanOf(id)).toMatchObject({ uri: "missing.feature" });
  rmSync(id);
});

test("a failed plan: the plugin's own error as it is; anything else the plugin's bug, the error its cause", () => {
  const own = pluginError("feature file can't be linked to stories", {
    quiet: true,
  });
  expect(failedPlan(own).error).toBe(own);
  const stray = new TypeError("x is undefined");
  const { error } = failedPlan(stray);
  expect(error.message).toMatch(
    /^\[@lotun\/vitest-cucumber\] a feature file's plan couldn't be made \(a bug in @lotun\/vitest-cucumber, please report it at /,
  );
  expect(error.cause).toBe(stray);
});
