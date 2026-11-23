import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, expect, test } from "vitest";
import { slash } from "../../../../utils/slash.ts";
import { createFeaturePlans } from "../../../feature/plans.ts";
import { configurationOf } from "../../../plugin/options.ts";
import { createStorybookPlans } from "../storybookPlans.ts";

const root = mkdtempSync(path.join(tmpdir(), "storybook-plans-"));
afterAll(() => {
  rmSync(root, { recursive: true, force: true });
});

const file = (name: string, content: string) => {
  const id = slash(path.join(root, name));
  mkdirSync(path.dirname(id), { recursive: true });
  writeFileSync(id, content);
  return id;
};

const stories = (name: string, exports: string[]) =>
  file(
    name,
    `export default { title: "T" };\n${exports.map((story) => `export const ${story} = {};`).join("\n")}\n`,
  );

const tagged = "@smoke\nFeature: A\n  @one\n  Scenario: s\n    Given a step\n";

/**
 * A project's feature plans and its Storybook plans on them (its support code the `support`
 * folder's, `import`), told a file's event as a host tells them: the feature plans first.
 */
const project = () => {
  const configuration = configurationOf({ import: ["support"] });
  const plans = createFeaturePlans({ root: () => root, configuration });
  const counted = { linkedChanges: 0 };
  const storybook = createStorybookPlans({
    plans,
    root: () => root,
    configuration,
    // Every stories file here writes its title.
    autoTitleOf: () => Promise.resolve(undefined),
    onLinkedFeaturesChanged: () => {
      counted.linkedChanges += 1;
    },
  });
  return {
    plans,
    storybook,
    counted,
    /** What `file`'s event leaves for the host to do. */
    fileChanged: async (
      type: "add" | "change" | "unlink",
      changed: string,
    ) => ({
      ...(await plans.onFileChange(type, changed)),
      ...(await storybook.onFileChange(type, changed)),
    }),
  };
};

/** Nothing left for the host. */
const nothing = {
  supportFilesChanged: false,
  staleFeatures: [],
  docsChanged: false,
};

test("storybookPlanOf: a feature next to its stories file: its plan from the parts as read, until one is read again", async () => {
  const id = file(
    "src/Login.feature",
    "Feature: Login\n  Scenario: s\n    Given a step\n",
  );
  const storiesFile = stories("src/Login.stories.ts", ["LogIn"]);
  const { plans, storybook, counted, fileChanged } = project();
  const plan = await storybook.storybookPlanOf(id);
  expect("error" in plan ? plan.error.message : plan.stories.code).toContain(
    'import * as __cucumberStories from "./Login.stories.ts";',
  );
  expect(plan).toMatchObject({ uri: "src/Login.feature", options: {} });
  expect(plan).toMatchObject(await plans.vitestPlanOf(id));
  expect(await storybook.storybookPlanOf(id)).toEqual(plan);
  // Linked, both ways; its host told once.
  expect(storybook.links.featuresOf(storiesFile)).toEqual([id]);
  expect(storybook.links.storiesFileOf(id)).toBe(storiesFile);
  expect(counted.linkedChanges).toBe(1);
  // Its stories file broken (no default export), nothing said: the stories as read.
  writeFileSync(storiesFile, "export const LogIn = {};\n");
  expect(await storybook.storybookPlanOf(id)).toEqual(plan);
  // The watcher's event: its feature to take as changed; its plan from the stories read again.
  expect(await fileChanged("change", storiesFile)).toEqual({
    ...nothing,
    staleFeatures: [id],
  });
  const broken = {
    error: {
      message: expect.stringContaining(
        "can't be read as a stories file",
      ) as string,
    },
  };
  expect(await storybook.storybookPlanOf(id)).toMatchObject(broken);
  expect(counted.linkedChanges).toBe(1);
  // Repaired, nothing said, then the cache cleared (a run's start): read again; the links stay.
  stories("src/Login.stories.ts", ["LogIn"]);
  expect(await storybook.storybookPlanOf(id)).toMatchObject(broken);
  plans.cache.clear();
  expect(storybook.links.features()).toEqual([id]);
  expect(await storybook.storybookPlanOf(id)).toEqual(plan);
  // Deleted: forgotten, its host told.
  await fileChanged("unlink", id);
  expect(storybook.links.features()).toEqual([]);
  expect(counted.linkedChanges).toBe(2);
  // Its cache is the feature plans'.
  expect(storybook.cache).toBe(plans.cache);
});

test("a feature that can't be planned is the feature plans' failed plan, for Storybook too", async () => {
  const { plans, storybook } = project();
  const unparsed = file("broken.feature", "@tag\nNot Gherkin\n");
  const failed = await plans.vitestPlanOf(unparsed);
  expect(await storybook.storybookPlanOf(unparsed)).toBe(failed);
  expect(await storybook.storybookIndexPlanOf(unparsed, () => "T")).toBe(
    failed,
  );
  const missing = path.join(root, "missing.feature");
  for (const plan of [
    await storybook.storybookPlanOf(missing),
    await storybook.storybookIndexPlanOf(missing, () => "T"),
  ]) {
    expect(plan).toMatchObject({
      error: { message: expect.stringContaining("ENOENT") as string },
    });
  }
});

test("a feature without a stories file is stopped by its links' error, and linked to none; a stories file added: tried again", async () => {
  const id = file("c.feature", tagged);
  const { storybook, fileChanged } = project();
  const plan = await storybook.storybookPlanOf(id);
  expect("error" in plan && plan.error.message).toContain(
    "Feature file can't be linked to stories:\n  - c.feature has no stories file",
  );
  expect(storybook.links.featuresOf(undefined)).toEqual([id]);
  // A stories file added next to it (`c.stories.ts`): it runs on it now.
  const added = stories("c.stories.ts", ["A"]);
  expect(await fileChanged("add", added)).toEqual({
    ...nothing,
    staleFeatures: [id],
  });
  expect(await storybook.storybookPlanOf(id)).toMatchObject({
    uri: "c.feature",
  });
  expect(storybook.links.featuresOf(added)).toEqual([id]);
  // Another stories file added: no feature of it, none without a stories file any more.
  expect(await fileChanged("add", stories("other.stories.ts", ["A"]))).toEqual(
    nothing,
  );
  rmSync(added);
  rmSync(path.join(root, "other.stories.ts"));
});

test("a stories file's event: really changed, or deleted, the features that run on it; with the text it had, or any other file, none", async () => {
  const id = file(
    "watch/Page.feature",
    "Feature: Page\n  Scenario: s\n    Given a step\n",
  );
  const other = file(
    "watch/Other.feature",
    "Feature: Other\n  Scenario: s\n    Given a step\n",
  );
  const storiesFile = stories("watch/Page.stories.ts", ["A"]);
  stories("watch/Other.stories.ts", ["A"]);
  const { storybook, fileChanged } = project();
  await storybook.storybookPlanOf(id);
  await storybook.storybookPlanOf(other);
  /** The feature files to touch for the watcher's event for `name`. */
  const touched = async (event: "add" | "change" | "unlink", name: string) =>
    (await fileChanged(event, path.join(root, name))).staleFeatures;
  // Its stories file with the text it had (touched, or saved as it was): nothing.
  expect(await touched("change", "watch/Page.stories.ts")).toEqual([]);
  // Really edited: its features.
  stories("watch/Page.stories.ts", ["A", "B"]);
  expect(await touched("change", "watch/Page.stories.ts")).toEqual([id]);
  // Any other file changed, or added: none.
  expect(await touched("change", "watch/Page.tsx")).toEqual([]);
  expect(await touched("add", "watch/Page.tsx")).toEqual([]);
  // Its stories file deleted: it; the other doesn't run on it.
  rmSync(storiesFile);
  expect(await touched("unlink", "watch/Page.stories.ts")).toEqual([id]);
  // A feature deleted: forgotten, not touched.
  rmSync(other);
  expect(await touched("unlink", "watch/Other.feature")).toEqual([]);
  expect(storybook.links.features()).toEqual([id]);
});

test("storybookIndexPlanOf: its Storybook plan and its index entries, with the title Storybook makes; its feature read at each ask", async () => {
  const id = file(
    "index/Login.feature",
    "Feature: Login\n  Scenario: Sign in\n    Given a step\n",
  );
  stories("index/Login.stories.ts", ["LogIn"]);
  const { storybook } = project();
  const makeTitle = (title?: string) => `Prefix/${title ?? "Auto"}`;
  const plan = await storybook.storybookIndexPlanOf(id, makeTitle);
  const entriesOf = (indexed: typeof plan) =>
    "error" in indexed
      ? indexed.error.message
      : indexed.indexEntries.map(({ exportName, title }) => ({
          exportName,
          title,
        }));
  expect(entriesOf(plan)).toEqual([
    { exportName: "__vitestCucumberFeature", title: "Prefix/T/Feature: Login" },
    { exportName: "SignIn", title: "Prefix/T/Feature: Login/Sign in" },
  ]);
  // The plan its modules are written from is the one it made.
  expect(plan).toMatchObject(await storybook.storybookPlanOf(id));
  // Another title: its entries'.
  expect(
    entriesOf(
      await storybook.storybookIndexPlanOf(
        id,
        (title) => `Other/${title ?? ""}`,
      ),
    ),
  ).toEqual([
    { exportName: "__vitestCucumberFeature", title: "Other/T/Feature: Login" },
    { exportName: "SignIn", title: "Other/T/Feature: Login/Sign in" },
  ]);
  // The file changed, its event not there yet (Storybook's own watcher asks first): read now.
  writeFileSync(id, "Feature: Login\n  Scenario: Sign out\n    Given a step\n");
  const changed = await storybook.storybookIndexPlanOf(id, makeTitle);
  expect(entriesOf(changed)).toEqual([
    { exportName: "__vitestCucumberFeature", title: "Prefix/T/Feature: Login" },
    { exportName: "SignOut", title: "Prefix/T/Feature: Login/Sign out" },
  ]);
  // Its other plans are made from the same reading.
  expect(changed).toMatchObject(await storybook.storybookPlanOf(id));
});

test("the Storybook steps: whether the support files have one, on the Storybook plan and the support plan; their expressions others, every Storybook feature to touch", async () => {
  const id = file(
    "sb/Card.feature",
    "Feature: Card\n  Scenario: s\n    Given a step\n",
  );
  stories("sb/Card.stories.ts", ["A"]);
  const steps = file("support/card.ts", `Given("a step", () => {});\n`);
  const { plans, storybook, fileChanged } = project();
  expect(await storybook.storybookPlanOf(id)).toMatchObject({
    storybookSteps: false,
  });
  expect(await storybook.storybookSupportPlanOf()).toMatchObject({
    options: {},
    supportFiles: [steps],
    storybookSteps: false,
  });
  // A support file's code edited, its Storybook steps the same (none): nothing.
  file("support/card.ts", `Given("a step", () => { /* edited */ });\n`);
  expect(await fileChanged("change", steps)).toEqual(nothing);
  // A Storybook step written in, the watcher's event not there yet: what was read.
  const withStep = `Given("a step", () => {});\nGiven("the {storybook:story} story", () => {});\n`;
  file("support/card.ts", withStep);
  expect(await storybook.storybookPlanOf(id)).toMatchObject({
    storybookSteps: false,
  });
  // The watcher's event: every Storybook feature; its plan with the steps read again.
  expect(await fileChanged("change", steps)).toEqual({
    ...nothing,
    staleFeatures: [id],
  });
  expect(await storybook.storybookPlanOf(id)).toMatchObject({
    storybookSteps: true,
  });
  expect(await storybook.storybookSupportPlanOf()).toMatchObject({
    storybookSteps: true,
  });
  // A run started since (the cache cleared, nothing asked): the last ones read are still what
  // an event is compared with.
  plans.cache.clear();
  expect(await fileChanged("change", steps)).toEqual(nothing);
  plans.cache.clear();
  file("support/card.ts", withStep.replace("the {", "on the {"));
  expect(await fileChanged("change", steps)).toEqual({
    ...nothing,
    staleFeatures: [id],
  });
  // A support file with a Storybook step added: the list another, and the steps.
  const more = file(
    "support/more.ts",
    `Given("the stories of {storybook:storiesFile}", () => {});\n`,
  );
  expect(await fileChanged("add", more)).toEqual({
    supportFilesChanged: true,
    staleFeatures: [id],
    docsChanged: false,
  });
  rmSync(more);
  rmSync(steps);
});

test("a feature naming its stories file in a step: touched as that file is deleted, and as it's created again", async () => {
  const steps = file(
    "support/named.ts",
    `Given("the stories of {storybook:storiesFile}", () => {});\n`,
  );
  const id = file(
    "named/Flow.feature",
    "Feature: Flow\n  Scenario: s\n    Given the stories of ./parts/Page.stories.ts\n",
  );
  const storiesFile = stories("named/parts/Page.stories.ts", ["A"]);
  const { storybook, fileChanged } = project();
  expect(await storybook.storybookPlanOf(id)).toMatchObject({
    uri: "named/Flow.feature",
  });
  expect(storybook.links.featuresOf(storiesFile)).toEqual([id]);
  // Deleted: it ran on it.
  rmSync(storiesFile);
  expect((await fileChanged("unlink", storiesFile)).staleFeatures).toEqual([
    id,
  ]);
  expect(await storybook.storybookPlanOf(id)).toMatchObject({
    error: { message: expect.stringContaining("doesn't exist") as string },
  });
  expect(storybook.links.featuresOf(undefined)).toEqual([id]);
  // Created again: not next to it by its name, but it has no stories file, so it's tried again.
  stories("named/parts/Page.stories.ts", ["A"]);
  expect((await fileChanged("add", storiesFile)).staleFeatures).toEqual([id]);
  expect(await storybook.storybookPlanOf(id)).toMatchObject({
    uri: "named/Flow.feature",
  });
  rmSync(steps);
});

test("a feature file's event: `docsChanged` only as the text of one that runs on a stories file really changed, never for a touch", async () => {
  const id = file(
    "live/Card.feature",
    "Feature: Card\n  Scenario: s\n    Given a step\n",
  );
  stories("live/Card.stories.ts", ["A"]);
  const unlinked = file("live/Loose.feature", tagged);
  const { storybook, fileChanged } = project();
  await storybook.storybookPlanOf(id);
  await storybook.storybookPlanOf(unlinked);
  // Touched, or saved as it was: the text read before.
  expect(await fileChanged("change", id)).toEqual(nothing);
  // Really edited.
  writeFileSync(id, "Feature: Card\n  Scenario: other\n    Given a step\n");
  expect(await fileChanged("change", id)).toEqual({
    ...nothing,
    docsChanged: true,
  });
  // The same event again (its echo): nothing more.
  expect(await fileChanged("change", id)).toEqual(nothing);
  // A feature with no stories file: none.
  writeFileSync(unlinked, tagged.replace("@one", "@two"));
  expect(await fileChanged("change", unlinked)).toEqual(nothing);
});

test("a touch changes nothing: a stories file's event with its text as read, and the event of a feature the host touched", async () => {
  const id = file(
    "echo/Card.feature",
    "Feature: Card\n  Scenario: s\n    Given a step\n",
  );
  const storiesFile = stories("echo/Card.stories.ts", ["A"]);
  const { storybook, fileChanged } = project();
  await storybook.storybookPlanOf(id);
  // The feature edited: its text for the host's docs; its stories file's event, its text as
  // read (a touch, a save as it was): no feature to touch.
  writeFileSync(id, "Feature: Card\n  Scenario: edited\n    Given a step\n");
  expect(await fileChanged("change", id)).toEqual({
    ...nothing,
    docsChanged: true,
  });
  expect(await fileChanged("change", storiesFile)).toEqual(nothing);
  // The stories file edited: its feature to touch; the feature's event (the host's touch),
  // its text as read: nothing for the docs.
  stories("echo/Card.stories.ts", ["A", "B"]);
  expect(await fileChanged("change", storiesFile)).toEqual({
    ...nothing,
    staleFeatures: [id],
  });
  expect(await fileChanged("change", id)).toEqual(nothing);
});

test("two features on one stories file with the same label: refused, each naming the other once both are linked; one renamed or deleted, the other is the host's to make again", async () => {
  const one = file(
    "src/Dup.feature",
    "Feature: Login\n  Scenario: s\n    Given a step\n",
  );
  const two = file(
    "src/Dup.feature.md",
    "# Feature: Login\n\n## Scenario: s\n* Given a step\n",
  );
  stories("src/Dup.stories.ts", ["S"]);
  const { storybook, fileChanged } = project();
  const refused = (feature: string, other: string) => ({
    error: {
      message: expect.stringContaining(
        `${feature}: src/Dup.stories.ts already has a "Feature: Login" (${other}): give one of them another name`,
      ) as string,
    },
  });
  const errorOf = async (feature: string) => {
    const plan = await storybook.storybookPlanOf(feature);
    return "error" in plan ? plan.error.message : undefined;
  };
  // The first linked: no other yet.
  expect(await errorOf(one)).toBeUndefined();
  expect(await storybook.storybookPlanOf(two)).toMatchObject(
    refused("src/Dup.feature.md", "src/Dup.feature"),
  );
  // Both linked: both refused.
  expect(await storybook.storybookPlanOf(one)).toMatchObject(
    refused("src/Dup.feature", "src/Dup.feature.md"),
  );
  // Its text edited, its label the same: no other to make again.
  file("src/Dup.feature", "Feature: Login\n  Scenario: t\n    Given a step\n");
  expect(await fileChanged("change", one)).toEqual({
    ...nothing,
    docsChanged: true,
  });
  // Renamed: the other to make again; neither refused.
  file(
    "src/Dup.feature",
    "Feature: Login again\n  Scenario: t\n    Given a step\n",
  );
  expect(await fileChanged("change", one)).toEqual({
    ...nothing,
    staleFeatures: [two],
    docsChanged: true,
  });
  expect(await errorOf(one)).toBeUndefined();
  expect(await errorOf(two)).toBeUndefined();
  // The same label again, then the other deleted: the one left to make again, not refused.
  file("src/Dup.feature", "Feature: Login\n  Scenario: t\n    Given a step\n");
  await fileChanged("change", one);
  expect(await errorOf(two)).toContain("already has");
  rmSync(two);
  expect(await fileChanged("unlink", two)).toMatchObject({
    staleFeatures: [one],
  });
  expect(await errorOf(one)).toBeUndefined();
});
