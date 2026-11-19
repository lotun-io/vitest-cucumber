import { EventEmitter } from "node:events";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  utimesSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, describe, expect, test, vi } from "vitest";
import type { Plugin } from "vitest/config";
import { ownModule } from "../../utils/ownModule.ts";
import {
  experimental_indexers,
  experimental_serverChannel,
  previewAnnotations,
  viteFinal,
} from "../preset.ts";
import { featuresMapId } from "../preset/featuresModule.ts";
import { type PresetOptions, projectOf } from "../preset/project.ts";
import {
  isPreviewSupport,
  mayBePreviewSupport,
  previewSupportId,
} from "../preset/supportModule.ts";
import { storybookOptionsOf } from "../vitest/storybookOptions.ts";

/**
 * A Storybook project of the test's own: its options file (its support code, a Storybook step), a stories
 * file and its feature file.
 */
const project = mkdtempSync(path.join(tmpdir(), "preset-"));
const configDir = path.join(project, ".storybook");
for (const [name, content] of Object.entries({
  // From the project's folder (an absolute path from `path.join` isn't a glob on Windows).
  ".storybook/cucumber.mjs": 'export default { import: ["steps/*.ts"] };\n',
  "steps/stories.ts": `Given("the {storybook:story} story", (story) => {});
Given("the stories of {storybook:storiesFile}", (file) => {});`,
  "src/Login.stories.ts": `import type { Meta, StoryObj } from "@storybook/react-vite";
import { Page } from "./Page";

const meta = { title: "Cucumber/Login", component: Page } satisfies Meta<typeof Page>;

export default meta;
type Story = StoryObj<typeof meta>;

export const LogIn: Story = { tags: ["smoke"] };
export const JustThePage: Story = {};
`,
  "src/Page.stories.ts": 'export default { title: "Page" };\n',
  // No title written: Storybook's automatic one, by its `stories`.
  "src/parts/Card.stories.ts": "export default {};\nexport const Plain = {};\n",
  "src/parts/Card.feature": `Feature: Card
  Scenario: Plain
    Given the Plain story
`,
  // No title written, and no `stories` pattern matches it.
  "elsewhere/Unlisted.stories.ts": "export default {};\n",
  "src/Unlisted.feature": `Feature: Unlisted
  Scenario: A
    Given the stories of elsewhere/Unlisted.stories.ts
`,
  "src/Typo.stories.ts":
    'export default { title: "Typo" };\nexport const Primary = {};\n',
  "src/Typo.feature": `Feature: Typo
  Scenario: A typo
    Given the Primry story
`,
  "src/Login.feature": `Feature: Login
  Background:
    Given I see the "Log in" button

  @smoke
  Scenario: Log in
    Given the LogIn story
    When I click the "Log in" button

  Scenario Outline: Sign up then log out with <first>
    Given the JustThePage story
    When I click the "<first>" button

    Examples:
      | first   |
      | Log in  |
      | Sign up |
`,
})) {
  mkdirSync(path.dirname(path.join(project, name)), { recursive: true });
  writeFileSync(path.join(project, name), content);
}
afterAll(() => {
  rmSync(project, { recursive: true, force: true });
});

const makeTitle = (title?: string) => title ?? "Auto";

/** Storybook's options to the preset's functions: its config folder, its presets (their `stories`). */
const options = {
  configDir,
  presets: {
    apply: (name: string) =>
      Promise.resolve(
        name === "stories"
          ? ["../src/**/*.stories.ts", "../src/**/*.feature"]
          : undefined,
      ),
  },
} as unknown as PresetOptions;

/** Runs `run` as Storybook's own process does (no `VITEST`, which this test run sets). */
const inStorybook = async <T>(run: () => Promise<T>) => {
  vi.stubEnv("VITEST", "");
  try {
    return await run();
  } finally {
    vi.unstubAllEnvs();
  }
};

/** Storybook's indexer (stubbed: Storybook's own isn't loaded here). */
const storybookIndexer = {
  test: /\.stories\.ts$/,
  createIndex: async () => [],
};

describe("Storybook's indexers, and ours for a feature file", () => {
  test("a feature file: its stories module indexed as Storybook's CSF indexer does, under its stories file's title", async () => {
    const indexers = await experimental_indexers([storybookIndexer], options);
    expect(indexers[1]).toBe(storybookIndexer);
    const feature = path.join(project, "src/Login.feature");
    const [indexer] = indexers;
    expect(indexer?.test.test(feature)).toBe(true);
    const entries = await inStorybook(async () =>
      indexer?.createIndex(feature, { makeTitle }),
    );
    expect(
      entries?.map(({ exportName, name, title, tags }) => ({
        exportName,
        name,
        title,
        tags,
      })),
    ).toEqual([
      {
        exportName: "LogIn",
        name: "Log in",
        title: "Cucumber/Login/Feature: Login",
        tags: ["smoke", "@smoke", "!autodocs", "!manifest", "play-fn"],
      },
      {
        exportName: "SignUpThenLogOutWithLogIn",
        name: "Sign up then log out with Log in",
        title: "Cucumber/Login/Feature: Login",
        tags: ["!autodocs", "!manifest", "play-fn"],
      },
      {
        exportName: "SignUpThenLogOutWithSignUp",
        name: "Sign up then log out with Sign up",
        title: "Cucumber/Login/Feature: Login",
        tags: ["!autodocs", "!manifest", "play-fn"],
      },
    ]);
  });

  test("a stories file that writes no title: Storybook's automatic one (by its `stories`), then the feature's label; the ids made from it", async () => {
    const [indexer] = await experimental_indexers([], options);
    const entries = await inStorybook(async () =>
      indexer?.createIndex(path.join(project, "src/parts/Card.feature"), {
        makeTitle,
      }),
    );
    expect(entries?.map(({ title, __id }) => ({ title, __id }))).toEqual([
      {
        title: "parts/Card/Feature: Card",
        __id: "parts-card-feature-card--plain",
      },
    ]);
  });

  test("a stories file with no title to take (none written, no `stories` pattern matches it): the feature's error, at its stories file step", async () => {
    const [indexer] = await experimental_indexers([], options);
    await expect(
      inStorybook(async () =>
        indexer?.createIndex(path.join(project, "src/Unlisted.feature"), {
          makeTitle,
        }),
      ),
    ).rejects.toThrow(
      'src/Unlisted.feature:3: elsewhere/Unlisted.stories.ts has no title: none is written in its meta, and no pattern of Storybook\'s "stories" matches it',
    );
  });
});

describe("a broken feature file (here a story its stories file doesn't have)", () => {
  const typo = path.join(project, "src/Typo.feature");
  const indexerOf = async () =>
    (await experimental_indexers([storybookIndexer], options))[0];

  test("stops Storybook's index: the indexer throws, its errors listed", async () => {
    await expect(
      inStorybook(async () =>
        (await indexerOf())?.createIndex(typo, { makeTitle }),
      ),
    ).rejects.toThrow('src/Typo.stories.ts has no story "Primry"');
  });

  test("in the addon's Vitest runs (`VITEST` set): no entries (its module throws the error, its story tests failing with it); a feature that can be used: its entries there too (a docs page of it needs them)", async () => {
    vi.stubEnv("VITEST", "true");
    try {
      const indexer = await indexerOf();
      expect(await indexer?.createIndex(typo, { makeTitle })).toEqual([]);
      expect(
        await indexer?.createIndex(path.join(project, "src/Login.feature"), {
          makeTitle,
        }),
      ).toHaveLength(3);
    } finally {
      vi.unstubAllEnvs();
    }
  });
});

test("in the addon's Vitest runs (`VITEST` set), `viteFinal` gives only the plugin that carries Storybook's options to the Vitest plugin", async () => {
  vi.stubEnv("VITEST", "true");
  const config = await viteFinal({ plugins: [] }, options);
  vi.unstubAllEnvs();
  expect(config.plugins).toHaveLength(1);
  expect(storybookOptionsOf([config.plugins?.[0] as Plugin])).toBe(options);
});

describe("each Storybook page's own modules", () => {
  test("story tests (`VITEST` set) get their annotation, Storybook's preview its own", () => {
    vi.stubEnv("VITEST", "true");
    expect(previewAnnotations(["a.ts"])).toEqual([
      "a.ts",
      ownModule("worker/storybook/vitest/annotation"),
    ]);
    vi.stubEnv("VITEST", "");
    expect(previewAnnotations()).toEqual([
      ownModule("worker/storybook/preview/annotation"),
    ]);
    vi.unstubAllEnvs();
  });

  test("the placeholder's path, as Vite writes it (any query)", () => {
    const placeholder = ownModule("worker/storybook/preview/support");
    expect(isPreviewSupport(placeholder.replaceAll("\\", "/"))).toBe(true);
    expect(isPreviewSupport(`${placeholder}?v=1`)).toBe(true);
    expect(isPreviewSupport(ownModule("worker/storybook/preview/runner"))).toBe(
      false,
    );
    expect(mayBePreviewSupport("./support.mjs")).toBe(true);
    expect(mayBePreviewSupport("./support.ts")).toBe(true);
    expect(mayBePreviewSupport("./supportCode.ts")).toBe(false);
  });

  test("the placeholder's import is the support module's own id, served its code (not the placeholder's path: Vite would cache it as a dependency)", async () => {
    vi.stubEnv("VITEST", "");
    const config = await viteFinal({}, options);
    vi.unstubAllEnvs();
    const plugin = config.plugins?.at(-1) as Plugin;
    const resolveId = plugin.resolveId as (
      this: unknown,
      source: string,
      importer?: string,
    ) => Promise<string | undefined>;
    const load = plugin.load as (
      this: unknown,
      id: string,
    ) => Promise<string | undefined>;
    const runner = ownModule("worker/storybook/preview/runner");
    const placeholder = ownModule("worker/storybook/preview/support");
    const context = {
      resolve: (source: string) =>
        Promise.resolve({
          id: source === "./support" ? placeholder : `/elsewhere/${source}`,
        }),
    };
    expect(await resolveId.call(context, "./support", runner)).toBe(
      previewSupportId,
    );
    expect(
      await resolveId.call(context, "./support.ts", "/src/steps.ts"),
    ).toBeUndefined();
    const code = await load.call({}, previewSupportId);
    expect(code).toContain(
      `await import(${JSON.stringify(path.join(project, "steps/stories.ts").replaceAll("\\", "/"))});`,
    );
    // Its own hot update (a support file changed, or a module one imports) reloads the page.
    expect(code).toContain(
      "if (import.meta.hot) import.meta.hot.accept(() => location.reload());",
    );
    expect(await load.call({}, placeholder)).toBeUndefined();
  });
});

describe("`storybook dev`: the dev server's watcher", () => {
  /** The preview plugin, as `viteFinal` gives it to Storybook's Vite. */
  const previewPlugin = async () => {
    vi.stubEnv("VITEST", "");
    const config = await viteFinal({}, options);
    vi.unstubAllEnvs();
    return config.plugins?.at(-1) as Plugin;
  };

  /** A dev server: its watcher an event emitter, its client graph's modules by id. */
  const devServer = (ids: string[]) => {
    const watcher = new EventEmitter();
    const modules = new Map(ids.map((id) => [id, { id }]));
    const invalidateModule = vi.fn();
    const reloadModule = vi.fn(() => Promise.resolve());
    const server = {
      watcher,
      ws: { on: vi.fn() },
      environments: {
        client: {
          reloadModule,
          moduleGraph: {
            idToModuleMap: modules,
            invalidateModule,
            getModuleById: (id: string) => modules.get(id),
            getModulesByFile: (file: string) => {
              const module = modules.get(file);
              return module ? new Set([module]) : undefined;
            },
          },
        },
      },
      config: { logger: { error: vi.fn() } },
    };
    return { server, watcher, invalidateModule, reloadModule };
  };

  const settled = () => new Promise((resolve) => setTimeout(resolve, 100));

  test("a support file added: the support module reloaded (the page with it), no feature module made again; the same list: nothing", async () => {
    const plugin = await previewPlugin();
    const feature = path.join(project, "src/Login.feature");
    const { server, watcher, invalidateModule, reloadModule } = devServer([
      previewSupportId,
      feature,
      path.join(project, "src/Login.stories.ts"),
    ]);
    (plugin.configureServer as (server: unknown) => void)(server);
    // The page is served the list.
    await (plugin.load as (this: unknown, id: string) => Promise<unknown>).call(
      {},
      previewSupportId,
    );
    const added = path.join(project, "steps/more.ts");
    writeFileSync(added, "");
    try {
      watcher.emit("add", added);
      await settled();
      expect(invalidateModule.mock.calls.map(([{ id }]) => id)).toEqual([]);
      // The support module's own hot update reloads the page.
      expect(reloadModule.mock.calls).toEqual([[{ id: previewSupportId }]]);
      watcher.emit("add", path.join(project, "src/Other.ts"));
      await settled();
      expect(reloadModule).toHaveBeenCalledTimes(1);
    } finally {
      // Deleted as the watcher would report it: the kept list of support files follows.
      rmSync(added);
      watcher.emit("unlink", added);
      await settled();
    }
  });

  test("a feature's stories file really changed: the feature's modules reloaded, nothing on disk; the stories file touched, or saved as it was: nothing", async () => {
    const plugin = await previewPlugin();
    const feature = path.join(project, "src/Login.feature");
    // The feature's stories module made (its stories file recorded).
    await (
      plugin.transform as (
        this: unknown,
        code: string,
        id: string,
      ) => Promise<unknown>
    ).call({}, "", feature);
    const old = new Date("2020-01-01T00:00:00Z");
    utimesSync(feature, old, old);
    const featureId = feature.replaceAll("\\", "/");
    const { server, watcher, reloadModule } = devServer([featureId]);
    (plugin.configureServer as (server: unknown) => void)(server);
    // Another file: nothing reloaded.
    watcher.emit("change", path.join(project, "src/Page.tsx"));
    await settled();
    expect(reloadModule).not.toHaveBeenCalled();
    // Its stories file with the text it had (touched, or saved as it was): not a change.
    const storiesFile = path.join(project, "src/Login.stories.ts");
    watcher.emit("change", storiesFile);
    await settled();
    expect(reloadModule).not.toHaveBeenCalled();
    // Really edited.
    const stories = readFileSync(storiesFile, "utf8");
    writeFileSync(storiesFile, `${stories}\n// edited\n`);
    try {
      watcher.emit("change", storiesFile);
      await settled();
      expect(reloadModule.mock.calls).toEqual([[{ id: featureId }]]);
      expect(statSync(feature).mtime > old).toBe(false);
    } finally {
      writeFileSync(storiesFile, stories);
      watcher.emit("change", storiesFile);
      await settled();
    }
  });
});

describe("the features map (`featuresOf`'s, in Storybook's preview)", () => {
  test("the placeholder's import is the map's own id; the map: each stories file's linked features, each one's text written in", async () => {
    vi.stubEnv("VITEST", "");
    const config = await viteFinal({}, options);
    vi.unstubAllEnvs();
    const plugin = config.plugins?.at(-1) as Plugin;
    // Storybook's index links each feature (Login.feature on Login.stories.ts).
    const indexer = (await experimental_indexers([], options))[0];
    await inStorybook(async () =>
      indexer?.createIndex(path.join(project, "src/Login.feature"), {
        makeTitle,
      }),
    );
    const placeholder = ownModule("worker/storybook/featuresMap");
    const resolveId = plugin.resolveId as (
      this: unknown,
      source: string,
      importer?: string,
    ) => Promise<string | undefined>;
    expect(
      await resolveId.call(
        { resolve: () => Promise.resolve({ id: placeholder }) },
        "./featuresMap",
        ownModule("worker/storybook/features"),
      ),
    ).toBe(featuresMapId);
    const addWatchFile = vi.fn();
    const code = await (
      plugin.load as (this: unknown, id: string) => Promise<string>
    ).call({ addWatchFile }, featuresMapId);
    expect(code).toContain('"./src/Login.stories.ts": [');
    expect(code).toContain('"fileName": "./src/Login.feature"');
    expect(code).toContain(
      JSON.stringify(
        readFileSync(path.join(project, "src/Login.feature"), "utf8"),
      ),
    );
    expect(code).not.toContain("?raw");
    // No watch file: the dev server reloads the map itself (`devWatch.ts`).
    expect(addWatchFile).not.toHaveBeenCalled();
  });

  test("a feature file deleted: it leaves the map (an import of it would fail the preview)", async () => {
    vi.stubEnv("VITEST", "");
    const config = await viteFinal({}, options);
    vi.unstubAllEnvs();
    const plugin = config.plugins?.at(-1) as Plugin;
    const load = plugin.load as (this: unknown, id: string) => Promise<string>;
    const gone = path.join(project, "src/Gone.feature");
    writeFileSync(
      gone,
      "Feature: Gone\n  Scenario: A\n    Given the LogIn story\n",
    );
    writeFileSync(
      path.join(project, "src/Gone.stories.ts"),
      'export default { title: "Gone" };\nexport const LogIn = {};\n',
    );
    const indexer = (await experimental_indexers([], options))[0];
    await inStorybook(async () => indexer?.createIndex(gone, { makeTitle }));
    const context = { addWatchFile: vi.fn() };
    expect(await load.call(context, featuresMapId)).toContain(
      "./src/Gone.feature",
    );
    // Deleted, the watcher's event not there yet: as the plans read it.
    rmSync(gone);
    expect(await load.call(context, featuresMapId)).toContain(
      "./src/Gone.feature",
    );
    // The watcher's event: forgotten, not in the map any more.
    const watcher = new EventEmitter();
    (plugin.configureServer as (server: unknown) => void)({
      watcher,
      ws: { on: vi.fn(), send: vi.fn() },
      environments: {
        client: {
          moduleGraph: {
            idToModuleMap: new Map(),
            invalidateModule: vi.fn(),
            getModuleById: () => undefined,
          },
        },
      },
      config: { logger: { error: vi.fn() } },
    });
    watcher.emit("unlink", gone);
    expect(await load.call(context, featuresMapId)).not.toContain(
      "./src/Gone.feature",
    );
    rmSync(path.join(project, "src/Gone.stories.ts"));
  });
});

test("the server channel hook: feature files whose index entries are out of date are invalidated in Storybook's index generator (by their paths from the working directory), then the channel's event sent; the channel given back", async () => {
  const dir = path.join(project, "channel", ".storybook");
  const invalidated: [string, boolean][] = [];
  const emitted: string[] = [];
  const asked: string[] = [];
  const channel = { emit: (event: string) => emitted.push(event) };
  const options = {
    configDir: dir,
    presets: {
      apply: (name: string) => {
        asked.push(name);
        return Promise.resolve({
          invalidate: (importPath: string, removed: boolean) =>
            invalidated.push([importPath, removed]),
        });
      },
    },
  };
  type Hook = typeof experimental_serverChannel;
  expect(
    await experimental_serverChannel(
      channel as unknown as Parameters<Hook>[0],
      options as unknown as Parameters<Hook>[1],
    ),
  ).toBe(channel);
  // Nothing out of date: nothing asked of Storybook.
  const channelProject = projectOf(options as unknown as PresetOptions);
  await channelProject.indexOutOfDate([]);
  expect({ asked, invalidated, emitted }).toEqual({
    asked: [],
    invalidated: [],
    emitted: [],
  });
  await channelProject.indexOutOfDate([
    path.join(process.cwd(), "src", "A.feature"),
    path.join(process.cwd(), "features", "b", "B.feature"),
  ]);
  expect(asked).toEqual(["storyIndexGenerator"]);
  expect(invalidated).toEqual([
    ["./src/A.feature", false],
    ["./features/b/B.feature", false],
  ]);
  expect(emitted).toEqual(["storyIndexInvalidated"]);
});
