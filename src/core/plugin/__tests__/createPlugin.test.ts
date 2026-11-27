import { EventEmitter } from "node:events";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, expect, test } from "vitest";
import type {
  Reporter,
  TestSpecification,
  VitestPluginContext,
} from "vitest/node";
import { slash } from "../../../utils/slash.ts";
import { createPlugin } from "../createPlugin.ts";

test("a wrong option: the plugin's error as the plugin is made", () => {
  expect(() =>
    createPlugin(
      { import: [], language: "klingon" },
      { platform: "platform.ts" },
    ),
  ).toThrow(
    '[@lotun/vitest-cucumber] the "language" option "klingon" isn\'t a Gherkin language',
  );
  expect(() => createPlugin({}, { platform: "platform.ts" })).toThrow(
    '[@lotun/vitest-cucumber] the "import" option is required',
  );
});

test("a feature file outside Vitest (Storybook's builder runs a Vite config's root plugins too): not transformed", async () => {
  const plugin = createPlugin({ import: [] }, { platform: "platform.ts" });
  expect(await plugin.transform("", "/project/Login.feature")).toBeUndefined();
  expect(await plugin.transform("", "/project/Login.ts")).toBeUndefined();
});

/** A project folder: two feature files, a test file that isn't one, a support file. */
const root = mkdtempSync(path.join(tmpdir(), "create-plugin-"));
afterAll(() => {
  rmSync(root, { recursive: true, force: true });
});
const file = (name: string, content: string) => {
  const id = slash(path.join(root, name));
  mkdirSync(path.dirname(id), { recursive: true });
  writeFileSync(id, content);
  return id;
};
const cart = file(
  "features/cart.feature",
  "@smoke\nFeature: Cart\n  Scenario: s\n    Given a step\n",
);
const login = file(
  "features/login.feature",
  "Feature: Login\n  @slow\n  Scenario: s\n    Given a step\n",
);
const other = slash(path.join(root, "src/other.test.ts"));
file("support/steps.ts", "");

const settled = () => new Promise((resolve) => setTimeout(resolve, 30));

/**
 * The plugin set up for a Vitest (watching or not) and its one project, both fakes: what the
 * plugin read of them and did to them.
 */
const setUp = async ({
  watch = false,
  testTags,
}: {
  watch?: boolean;
  /** A plugin built on this one's declared tags (`declaredTagsWith`), given before the project is set up. */
  testTags?: (tags: readonly string[]) => Promise<readonly string[]>;
} = {}) => {
  const fileWatcher = new EventEmitter();
  const closing: (() => void)[] = [];
  const takenAsChanged: string[] = [];
  const invalidated: string[] = [];
  const logged: unknown[] = [];
  const reporters: Reporter[] = [];
  const vitest = {
    config: { watch, reporters },
    vite: { watcher: fileWatcher },
    watcher: {
      onFileChange: (changed: string) => {
        takenAsChanged.push(changed);
      },
    },
    logger: {
      formatError: () => ({ output: "plain" }),
      error: (error: unknown) => {
        logged.push(error);
      },
    },
    onClose: (listener: () => void) => {
      closing.push(listener);
    },
    invalidateFile: (id: string) => {
      invalidated.push(id);
    },
  };
  const provided: Record<string, unknown> = {};
  const tags: { name: string; description?: string }[] = [];
  const project = {
    name: "shop",
    config: {
      tags,
      maxWorkers: 2,
      isolate: true,
      testTimeout: 5000,
      hookTimeout: 10_000,
    },
    globTestFiles: () => Promise.resolve({ testFiles: [cart, login, other] }),
    provide: (key: string, value: unknown) => {
      provided[key] = value;
    },
    getProvidedContext: () => provided,
    vitest,
  };
  const cacheKeys: ((module: { id: string }) => unknown)[] = [];
  const plugin = createPlugin(
    { import: ["support"] },
    { platform: "platform.ts" },
  );
  if (testTags) {
    plugin.declaredTagsWith(testTags);
  }
  plugin.configResolved({ root });
  await plugin.configureVitest({
    vitest,
    project,
    defineCacheKeyGenerator: (
      generator: (module: { id: string }) => unknown,
    ) => {
      cacheKeys.push(generator);
    },
  } as unknown as VitestPluginContext);
  return {
    plugin,
    fileWatcher,
    takenAsChanged,
    invalidated,
    logged,
    reporters,
    provided,
    cacheKeys,
    project,
    tagNames: () => tags.map(({ name }) => name),
    /** A run of `files` starts, as Vitest tells its reporters. */
    runStart: (files: string[]) =>
      reporters[0]?.onTestRunStart?.(
        files.map((moduleId) => ({
          project,
          moduleId,
        })) as unknown as TestSpecification[],
      ),
  };
};

test("a project set up: every feature file's tags declared on it, its workers given the plugin's context, a feature module kept out of Vitest's file system cache, the runs' reporter added", async () => {
  const { tagNames, provided, cacheKeys, reporters } = await setUp();
  expect(tagNames()).toEqual(["@smoke", "@slow"]);
  expect(provided.vitestCucumber).toMatchObject({
    command: { port: 0, token: "" },
    colors: false,
    totalWorkers: 2,
    isolate: true,
    testTimeout: 5000,
    hookTimeout: 10_000,
    projectName: "shop",
    sendMessages: false,
    timedTags: [],
  });
  const [cacheKey] = cacheKeys;
  expect(cacheKey?.({ id: cart })).toBe(false);
  expect(cacheKey?.({ id: `${cart}?vitest-cucumber-storybook` })).toBe(false);
  expect(cacheKey?.({ id: other })).toBeUndefined();
  expect(reporters).toHaveLength(1);
});

test("a run's start: what was read for the last one is read again, each of its feature files' modules made again, its tags declared", async () => {
  const { runStart, invalidated, tagNames } = await setUp();
  // Edited since the project was set up, with no watcher to say so.
  writeFileSync(
    cart,
    "@smoke @checkout\nFeature: Cart\n  Scenario: s\n    Given a step\n",
  );
  await runStart([cart, other]);
  expect(invalidated).toEqual([cart]);
  expect(tagNames()).toEqual(["@smoke", "@slow", "@checkout"]);
});

test("the declared tags of a plugin built on this one (`declaredTagsWith`: Storybook's, every tag its tests may have): as the project is set up and as a run starts", async () => {
  // As the fixture is (an earlier test edits it).
  writeFileSync(
    cart,
    "@smoke\nFeature: Cart\n  Scenario: s\n    Given a step\n",
  );
  const { runStart, tagNames } = await setUp({
    testTags: (tags) =>
      Promise.resolve(tags.filter((tag) => !tag.startsWith("@s"))),
  });
  expect(tagNames()).toEqual([]);
  writeFileSync(
    cart,
    "@smoke @checkout\nFeature: Cart\n  Scenario: s\n    Given a step\n",
  );
  await runStart([cart]);
  expect(tagNames()).toEqual(["@checkout"]);
  writeFileSync(
    cart,
    "@smoke\nFeature: Cart\n  Scenario: s\n    Given a step\n",
  );
});

test("a watching Vitest: the support files' list another, every feature file of its projects is taken as changed; any other event, none", async () => {
  const { fileWatcher, takenAsChanged } = await setUp({ watch: true });
  // A feature file's own change is Vitest's to follow; a file that's no support file: nothing.
  fileWatcher.emit("change", cart);
  fileWatcher.emit("add", slash(path.join(root, "src/new.ts")));
  await settled();
  expect(takenAsChanged).toEqual([]);
  const added = file("support/more.ts", "");
  fileWatcher.emit("add", added);
  await settled();
  expect(takenAsChanged).toEqual([cart, login]);
  rmSync(added);
});

test("the plans of a plugin built on this one (`watchWith`: Storybook's): told each event, once, and the features they say are out of date taken as changed", async () => {
  const { plugin, fileWatcher, takenAsChanged } = await setUp({ watch: true });
  const told: string[] = [];
  plugin.watchWith((type, changed) => {
    told.push(`${type} ${changed}`);
    return Promise.resolve({
      supportFilesChanged: false,
      staleFeatures: changed.endsWith(".stories.ts") ? [login] : [],
    });
  });
  fileWatcher.emit("change", "/p/src/Login.stories.ts");
  fileWatcher.emit("unlink", "/p/src/Login.tsx");
  await settled();
  expect(told).toEqual([
    "change /p/src/Login.stories.ts",
    "unlink /p/src/Login.tsx",
  ]);
  expect(takenAsChanged).toEqual([login]);
});

test("the plans failing at an event: Vitest's logger gets the error, nothing thrown", async () => {
  const { plugin, fileWatcher, logged } = await setUp({ watch: true });
  const failure = new Error("can't list the support files");
  plugin.watchWith(() => Promise.reject(failure));
  fileWatcher.emit("add", "/p/src/new.ts");
  await settled();
  expect(logged).toEqual([failure]);
});

test("a Vitest that doesn't watch (`vitest run`): no file event listened to", async () => {
  const { fileWatcher } = await setUp();
  expect(fileWatcher.listenerCount("add")).toBe(0);
});
