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

/** The project's Storybook steps: always there (every Storybook feature names its stories file and story). */
const storybookSteps = file(
  "support/storybook.ts",
  [
    `Given("the {storybook:story} story", () => {});`,
    `Given("the stories of {storybook:storiesFile}", () => {});`,
  ].join("\n"),
);

/**
 * A feature `name`, its Background naming `storiesFile`, then `scenarios` (one on the meta by
 * default).
 */
const linked = (
  name: string,
  storiesFile: string,
  scenarios = '  Scenario: s\n    Given the "default" story\n',
) =>
  `Feature: ${name}\n  Background:\n    Given the stories of "${storiesFile}"\n${scenarios}`;

/**
 * A project's feature plans and its Storybook plans on them (its support code the `support`
 * folder's, `import`), told a file's event as a host tells them: Storybook's, which tell the
 * feature plans.
 */
const project = () => {
  const configuration = configurationOf({ import: ["support"] });
  const plans = createFeaturePlans({ root: () => root, configuration });
  const counted = { linkedChanges: 0 };
  const storybook = createStorybookPlans({
    plans,
    root: () => root,
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
    fileChanged: storybook.onFileChange,
  };
};

/** Nothing left for the host. */
const nothing = {
  supportFilesChanged: false,
  staleFeatures: [],
};

test("storybookPlanOf: a feature on its stories file: its plan from the parts as read, until one is read again", async () => {
  const id = file("src/Login.feature", linked("Login", "./Login.stories.ts"));
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

test("an error a Background's step gives every scenario is listed once", async () => {
  stories("src/Once.stories.ts", ["Primary"]);
  const id = file(
    "src/Once.feature",
    `Feature: Once\n  Background:\n    Given the stories of "./Once.stories.ts"\n    And the "Nope" story\n  Scenario: one\n    Given a step\n  Scenario: two\n    Given a step\n  Scenario: three\n    Given a step\n`,
  );
  const { storybook } = project();
  const plan = await storybook.storybookPlanOf(id);
  const message = "error" in plan ? plan.error.message : "";
  expect(message).toContain('has no story "Nope" (it has Primary)');
  expect(message.match(/has no story "Nope"/g)).toHaveLength(1);
});

test("a feature naming no stories file is stopped by its links' error, and linked to none: a stories file next to it, added, isn't its", async () => {
  const id = file(
    "c.feature",
    '@smoke\nFeature: A\n  @one\n  Scenario: s\n    Given the "default" story\n',
  );
  const { storybook, fileChanged } = project();
  const plan = await storybook.storybookPlanOf(id);
  expect("error" in plan && plan.error.message).toContain(
    "feature file can't be linked to stories\n  - the feature names no stories file, add a stories file step to its Background\n    c.feature:2",
  );
  expect(storybook.links.has(id)).toBe(true);
  expect(storybook.links.storiesFileOf(id)).toBeUndefined();
  const added = stories("c.stories.ts", ["A"]);
  expect(await fileChanged("add", added)).toEqual(nothing);
  rmSync(added);
});

test("a stories file's event: really changed, or deleted, the features that run on it; with the text it had, or any other file, none", async () => {
  const id = file("watch/Page.feature", linked("Page", "./Page.stories.ts"));
  const other = file(
    "watch/Other.feature",
    linked("Other", "./Other.stories.ts"),
  );
  const storiesFile = stories("watch/Page.stories.ts", ["A"]);
  stories("watch/Other.stories.ts", ["A"]);
  const { storybook, fileChanged } = project();
  await storybook.storybookPlanOf(id);
  await storybook.storybookPlanOf(other);
  /** The feature files out of date after the watcher's event for `name`. */
  const staleAfter = async (event: "add" | "change" | "unlink", name: string) =>
    (await fileChanged(event, path.join(root, name))).staleFeatures;
  // Its stories file with the text it had (touched, or saved as it was): nothing.
  expect(await staleAfter("change", "watch/Page.stories.ts")).toEqual([]);
  // Really edited: its features.
  stories("watch/Page.stories.ts", ["A", "B"]);
  expect(await staleAfter("change", "watch/Page.stories.ts")).toEqual([id]);
  // Any other file changed, or added: none.
  expect(await staleAfter("change", "watch/Page.tsx")).toEqual([]);
  expect(await staleAfter("add", "watch/Page.tsx")).toEqual([]);
  // Its stories file deleted: it; the other doesn't run on it.
  rmSync(storiesFile);
  expect(await staleAfter("unlink", "watch/Page.stories.ts")).toEqual([id]);
  // A feature deleted: forgotten, not out of date.
  rmSync(other);
  expect(await staleAfter("unlink", "watch/Other.feature")).toEqual([]);
  expect(storybook.links.features()).toEqual([id]);
});

test("storybookIndexPlanOf: its Storybook plan and its index entries, with the title Storybook makes; its feature read at each ask", async () => {
  const id = file(
    "index/Login.feature",
    linked(
      "Login",
      "./Login.stories.ts",
      '  Scenario: Sign in\n    Given the "default" story\n',
    ),
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
  writeFileSync(
    id,
    linked(
      "Login",
      "./Login.stories.ts",
      '  Scenario: Sign out\n    Given the "default" story\n',
    ),
  );
  const changed = await storybook.storybookIndexPlanOf(id, makeTitle);
  expect(entriesOf(changed)).toEqual([
    { exportName: "__vitestCucumberFeature", title: "Prefix/T/Feature: Login" },
    { exportName: "SignOut", title: "Prefix/T/Feature: Login/Sign out" },
  ]);
  // Its other plans are made from the same reading.
  expect(changed).toMatchObject(await storybook.storybookPlanOf(id));
});

test("the Storybook steps: their expressions others, every Storybook feature out of date; the support plan, the support files and the options", async () => {
  const id = file("sb/Card.feature", linked("Card", "./Card.stories.ts"));
  stories("sb/Card.stories.ts", ["A"]);
  const steps = file("support/card.ts", `Given("a step", () => {});\n`);
  const { plans, storybook, fileChanged } = project();
  expect(await storybook.storybookPlanOf(id)).toMatchObject({
    uri: "sb/Card.feature",
  });
  expect(await storybook.storybookSupportPlanOf()).toEqual({
    options: plans.options,
    supportFiles: [steps, storybookSteps],
  });
  // A support file's code edited, its Storybook steps the same (none): nothing.
  file("support/card.ts", `Given("a step", () => { /* edited */ });\n`);
  expect(await fileChanged("change", steps)).toEqual(nothing);
  // A Storybook step written in: every Storybook feature.
  const withStep = `Given("a step", () => {});\nGiven("the {storybook:story} card", () => {});\n`;
  file("support/card.ts", withStep);
  expect(await fileChanged("change", steps)).toEqual({
    ...nothing,
    staleFeatures: [id],
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
  // Saved as a delete, then an add (an editor's), the file there again by then: the list is the
  // same, the steps read again all the same.
  file("support/card.ts", withStep.replace("the {", "with the {"));
  expect(await fileChanged("unlink", steps)).toEqual({
    ...nothing,
    staleFeatures: [id],
  });
  expect(await fileChanged("add", steps)).toEqual(nothing);
  // Any other file added, the list the same: the steps aren't read for it (a support file's own
  // event is what says they may be others).
  file("support/card.ts", withStep.replace("the {", "by the {"));
  expect(await fileChanged("add", path.join(root, "sb/Card.tsx"))).toEqual(
    nothing,
  );
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
  });
  rmSync(more);
  rmSync(steps);
});

test("a feature's stories file: out of date as that file is deleted, and as it's created again (still linked to it)", async () => {
  const id = file(
    "named/Flow.feature",
    linked("Flow", "./parts/Page.stories.ts"),
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
  // Still linked to the file it names: the file's event concerns it.
  expect(storybook.links.featuresOf(storiesFile)).toEqual([id]);
  stories("named/parts/Page.stories.ts", ["A"]);
  expect((await fileChanged("add", storiesFile)).staleFeatures).toEqual([id]);
  expect(await storybook.storybookPlanOf(id)).toMatchObject({
    uri: "named/Flow.feature",
  });
});

test("a touch changes nothing: a stories file's event with its text as read, and a feature's with its text as read", async () => {
  const id = file("echo/Card.feature", linked("Card", "./Card.stories.ts"));
  const storiesFile = stories("echo/Card.stories.ts", ["A"]);
  const { storybook, fileChanged } = project();
  await storybook.storybookPlanOf(id);
  // The feature edited, its label the same: nothing of the plans' (its own module is its
  // host's, what shows its text too); its stories file's event, its text as read (a touch, a
  // save as it was): no feature out of date.
  writeFileSync(
    id,
    linked(
      "Card",
      "./Card.stories.ts",
      '  Scenario: edited\n    Given the "default" story\n',
    ),
  );
  expect(await fileChanged("change", id)).toEqual(nothing);
  expect(await fileChanged("change", storiesFile)).toEqual(nothing);
  // The stories file edited: its feature out of date; the feature's own event then: nothing.
  stories("echo/Card.stories.ts", ["A", "B"]);
  expect(await fileChanged("change", storiesFile)).toEqual({
    ...nothing,
    staleFeatures: [id],
  });
  expect(await fileChanged("change", id)).toEqual(nothing);
});

test("two features on one stories file with the same label: refused, each naming the other once both are linked; one renamed or deleted, the other is the host's to make again", async () => {
  const one = file("src/Dup.feature", linked("Login", "./Dup.stories.ts"));
  const two = file(
    "src/Dup.feature.md",
    '# Feature: Login\n\n## Background:\n* Given the stories of "./Dup.stories.ts"\n\n## Scenario: s\n* Given the "default" story\n',
  );
  stories("src/Dup.stories.ts", ["S"]);
  const { storybook, fileChanged } = project();
  /** `text` as a regular expression's, matching itself. */
  const literal = (text: string) =>
    text.replaceAll(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const refused = (feature: string, other: string) => ({
    error: {
      message: expect.stringMatching(
        new RegExp(
          `src/Dup\\.stories\\.ts already has a feature named "Feature: Login", rename one of them \\(story id "[^\\n]*\\n {4}${literal(other)}:\\d+\\n {4}${literal(feature)}:\\d+$`,
        ),
      ) as string,
    },
  });
  const planErrorOf = async (feature: string) => {
    const plan = await storybook.storybookPlanOf(feature);
    return "error" in plan ? plan.error.message : undefined;
  };
  // The first linked: no other yet.
  expect(await planErrorOf(one)).toBeUndefined();
  expect(await storybook.storybookPlanOf(two)).toMatchObject(
    refused("src/Dup.feature.md", "src/Dup.feature"),
  );
  // Both linked: both refused.
  expect(await storybook.storybookPlanOf(one)).toMatchObject(
    refused("src/Dup.feature", "src/Dup.feature.md"),
  );
  // Its text edited, its label the same: no other to make again.
  file(
    "src/Dup.feature",
    linked(
      "Login",
      "./Dup.stories.ts",
      '  Scenario: t\n    Given the "default" story\n',
    ),
  );
  expect(await fileChanged("change", one)).toEqual(nothing);
  // Renamed: the other to make again; neither refused.
  file("src/Dup.feature", linked("Login again", "./Dup.stories.ts"));
  expect(await fileChanged("change", one)).toEqual({
    ...nothing,
    staleFeatures: [two],
  });
  expect(await planErrorOf(one)).toBeUndefined();
  expect(await planErrorOf(two)).toBeUndefined();
  // The same label again, then the other deleted: the one left to make again, not refused.
  file(
    "src/Dup.feature",
    linked(
      "Login",
      "./Dup.stories.ts",
      '  Scenario: t\n    Given the "default" story\n',
    ),
  );
  await fileChanged("change", one);
  expect(await planErrorOf(two)).toContain("already has");
  rmSync(two);
  expect(await fileChanged("unlink", two)).toMatchObject({
    staleFeatures: [one],
  });
  expect(await planErrorOf(one)).toBeUndefined();
});

test("its tests' Vitest tags: their pickles' but Storybook's built-in ones (`@tag(dev)`, `@tag(!test)`), its stories' all of them", async () => {
  const id = file(
    "tags/Tagged.feature",
    linked(
      "Tagged",
      "./Tagged.stories.ts",
      '  @tag(!dev) @tag(slow) @tag(!test) @smoke\n  Scenario: s\n    Given the "default" story\n',
    ),
  );
  stories("tags/Tagged.stories.ts", []);
  const { storybook } = project();
  const plan = await storybook.storybookPlanOf(id);
  if ("error" in plan) {
    throw plan.error;
  }
  expect(plan.featureTree.children).toMatchObject([
    { tags: ["slow", "@smoke"] },
  ]);
  expect(plan.stories.code).toContain(
    'tags: ["!dev","slow","!test","@smoke","!autodocs","!manifest"]',
  );
});
