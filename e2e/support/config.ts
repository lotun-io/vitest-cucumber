// A scenario's Vitest config files, as the steps write them: the scenario's own (or the default
// one, see `./project.ts`) in `vitest.scenario.ts` next to it, and `vitest.config.ts`, which
// exports it with what this repository needs of every run (`withRepository`), whatever the
// scenario's config is.
import { playwright } from "@vitest/browser-playwright";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { inject } from "vitest";
import type {} from "./chromium.ts";
import { relative, resolve, slash } from "./paths.ts";

/**
 * The plugin's modules, loaded by Node as its users' are (in `node_modules`, Vitest externalizes
 * them): this repository's `src/` is outside `node_modules`, Vitest would inline them.
 */
const pluginModules = new RegExp(
  `^${RegExp.escape(resolve(import.meta.dirname, "../../src"))}/`,
);

/**
 * The workers' Node options while this repository's coverage collects its subprocesses' (it sets
 * `NODE_V8_COVERAGE` as it starts, after this module loads): their coverage written as Vitest stops
 * them (see `../utils/exitOnSigterm.ts`).
 */
const coverageExecArgv = () =>
  process.env.NODE_V8_COVERAGE
    ? [
        "--import",
        pathToFileURL(
          path.resolve(import.meta.dirname, "../utils/exitOnSigterm.ts"),
        ).href,
      ]
    : [];

interface TestConfig {
  server?: { deps?: { external?: (string | RegExp)[] } };
  execArgv?: string[];
  projects?: unknown[];
}

/** Whether `browser` is a browser config whose every instance is Chromium. */
const isChromiumOnly = (browser: unknown): browser is object =>
  typeof browser === "object" &&
  browser !== null &&
  "instances" in browser &&
  Array.isArray(browser.instances) &&
  browser.instances.length > 0 &&
  browser.instances.every(
    (instance: unknown) =>
      typeof instance === "object" &&
      instance !== null &&
      "browser" in instance &&
      instance.browser === "chromium",
  );

/**
 * `test` with its browser on the run's shared Chromium (`./chromium.ts`, its endpoint
 * `wsEndpoint`) when each of its instances is Chromium, as the default configs' (`./project.ts`): a
 * scenario's own `provider: playwright()` would launch a Chromium of its own. Others (Firefox,
 * WebKit) launch their own, as they are.
 */
const onSharedChromium = (test: object, wsEndpoint: string | undefined) =>
  wsEndpoint && "browser" in test && isChromiumOnly(test.browser)
    ? {
        ...test,
        browser: {
          ...test.browser,
          provider: playwright({ connectOptions: { wsEndpoint } }),
        },
      }
    : test;

/** An inline project's `test` on the shared Chromium (see `onSharedChromium`); others as they are. */
const projectOnSharedChromium = (
  project: unknown,
  wsEndpoint: string | undefined,
) =>
  typeof project === "object" &&
  project !== null &&
  "test" in project &&
  typeof project.test === "object" &&
  project.test !== null
    ? { ...project, test: onSharedChromium(project.test, wsEndpoint) }
    : project;

/**
 * A scenario's config, with what this repository needs, in its root `test`: its inline projects
 * inherit it; projects in files of their own get it from their own config (also written here). A
 * config function (the default configs': `./project.ts`) is called first.
 */
export const withRepository = (
  exported: { test?: TestConfig } | (() => { test?: TestConfig }),
  /** The run's shared Chromium (`./chromium.ts`): the scenario's Chromium-only browsers on it. */
  chromium?: string,
) => {
  const config = typeof exported === "function" ? exported() : exported;
  if (typeof config !== "object") {
    throw new Error(
      "A scenario's Vitest config must export an object or a function",
    );
  }
  const { test = {} } = config;
  return {
    ...config,
    test: {
      ...onSharedChromium(test, chromium),
      ...(test.projects && {
        projects: test.projects.map((project) =>
          projectOnSharedChromium(project, chromium),
        ),
      }),
      execArgv: [...(test.execArgv ?? []), ...coverageExecArgv()],
      server: {
        ...test.server,
        deps: {
          ...test.server?.deps,
          external: [...(test.server?.deps?.external ?? []), pluginModules],
        },
      },
    },
  };
};

/**
 * Throws if a run of Vitest transformed any of the plugin's modules on the Node side, in a project
 * that uses the plugin: they must be loaded by Node, as its users' are (see `withRepository`; the
 * repository's own config, too). Other projects (e.g. unit tests of `src/`) may transform them. A
 * module Vite transformed has a `transformResult` in its environment's module graph; one Node loads is only resolved there. The
 * environments the browser consumes are left out: the page loads the plugin's modules from Vite.
 */
export const checkPluginModules = (vitest: {
  projects: readonly {
    name: string;
    vite: {
      config: { plugins: readonly { name: string }[] };
      environments: Record<
        string,
        {
          config: { consumer: string };
          moduleGraph: {
            fileToModulesMap: Map<string, Set<{ transformResult: unknown }>>;
          };
        }
      >;
    };
  }[];
}) => {
  const src = `${resolve(import.meta.dirname, "../../src")}/`;
  const usePlugin = vitest.projects.filter(({ vite }) =>
    vite.config.plugins.some(({ name }) => name.startsWith("vitest-cucumber:")),
  );
  const transformed = usePlugin.flatMap((project) =>
    Object.entries(project.vite.environments)
      .filter(([, environment]) => environment.config.consumer !== "client")
      .flatMap(([name, { moduleGraph }]) =>
        [...moduleGraph.fileToModulesMap]
          .filter(
            ([file, modules]) =>
              slash(file).startsWith(src) &&
              [...modules].some(({ transformResult }) => transformResult),
          )
          .map(
            ([file]) =>
              `${project.name || "(root)"} ${name}: ${relative(src, file)}`,
          ),
      ),
  );
  if (transformed.length > 0) {
    throw new Error(
      `Vitest transformed the plugin's modules, instead of Node loading them (is \`server.deps.external\` missing from the config?):\n${transformed.join("\n")}`,
    );
  }
};

/** A Vite plugin, or plugins (as a config lists them: arrays nested). */
type Plugins = unknown;

interface ProjectConfig {
  plugins?: Plugins[];
  test?: TestConfig & {
    include?: string[];
    projects?: unknown[];
    browser?: Record<string, unknown>;
  };
}

/** Whether `plugins` has the plugin's (a `vitest-cucumber:` one, its array's). */
const hasCucumber = (plugins: Plugins[] = []): boolean =>
  plugins.flat(Infinity).some((plugin) => isCucumber(plugin));

/** Whether `plugin` is one of the plugin's (`vitest-cucumber:`). */
const isCucumber = (plugin: unknown) =>
  typeof plugin === "object" &&
  plugin !== null &&
  String((plugin as { name?: unknown }).name).startsWith("vitest-cucumber:");

/**
 * A scenario's config as a Storybook project's (`storybook` mode, `./storybookProject.ts`): each of
 * its projects with the plugin (the root config, or an inline project) is the addon's, `before`
 * (`react()`) and `after` (`storybookTest()`) around its own plugins, in `browser` (Chromium: its
 * own browser options kept), without its `include` (the addon's test files are Storybook's
 * `stories`: it ignores one, with a warning); any other project is as it is. Its `cucumber(…)` is
 * taken out: a Storybook project gets the plugin from its addon entry in `.storybook/main.ts`, with
 * the harness's default options (a scenario's own config in storybook mode passes those).
 */
export const asStorybook = (
  config: ProjectConfig,
  {
    before,
    after,
    browser,
  }: {
    before: Plugins[];
    after: Plugins[];
    browser: Record<string, unknown>;
  },
): ProjectConfig => {
  const project = <Project extends ProjectConfig>(config: Project): Project => {
    if (!hasCucumber(config.plugins)) {
      return config;
    }
    const { include: _include, ...test } = config.test ?? {};
    const others = (config.plugins ?? [])
      .flat(Infinity)
      .filter((own) => !isCucumber(own));
    return {
      ...config,
      plugins: [...before, ...others, ...after],
      test: {
        ...test,
        browser: { ...browser, ...config.test?.browser, enabled: true },
      },
    };
  };
  const root = project(config);
  return {
    ...root,
    ...(root.test?.projects && {
      test: {
        ...root.test,
        projects: root.test.projects.map((inline) =>
          typeof inline === "object" && inline !== null
            ? project(inline as ProjectConfig)
            : inline,
        ),
      },
    }),
  };
};

/**
 * The config `name` exporting the scenario's (`./vitest.scenario.ts`), with what the repository
 * needs: a function, its plugins (Storybook's) made per Vitest (see `./project.ts`'s `defaultConfig`);
 * a Storybook project's browser with the Playwright `provider` (code: `./project.ts`'s).
 */
const configWrapper = (provider?: string) =>
  provider
    ? `import { storybookTest } from "@storybook/addon-vitest/vitest-plugin";
import react from "@vitejs/plugin-react";
import { playwright } from "@vitest/browser-playwright";
import path from "node:path";
import { asStorybook, withRepository } from ${JSON.stringify(import.meta.filename)};
import config from "./vitest.scenario.ts";

export default () =>
  withRepository(
    asStorybook(typeof config === "function" ? config() : config, {
      before: [react()],
      after: [storybookTest({ configDir: path.join(import.meta.dirname, ".storybook") })],
      browser: {
        headless: true,
        provider: ${provider},
        instances: [{ browser: "chromium" }],
        screenshotFailures: false,
      },
    }),
  );
`
    : `import { withRepository } from ${JSON.stringify(import.meta.filename)};
import config from "./vitest.scenario.ts";

export default () => withRepository(config, ${JSON.stringify(inject("e2eChromium"))});
`;

/**
 * Writes a Vitest config (`name`: e.g. `packages/a/vitest.config.ts`, in the scenario's project) of
 * `content`, with the scenario's `write`.
 */
export const writeConfig = async (
  scenario: { write(name: string, content: string): Promise<void> },
  name: string,
  content: string,
) => {
  await scenario.write(
    path.join(path.dirname(name), "vitest.scenario.ts"),
    content,
  );
  await scenario.write(name, configWrapper());
};

/**
 * Makes the scenario's own config `name` a Storybook project's (`asStorybook`), as it is otherwise
 * (`storybook` mode, `./project.ts`), its browser with the Playwright `provider` (code).
 */
export const writeStorybookWrapper = (
  scenario: { write(name: string, content: string): Promise<void> },
  name: string,
  provider: string,
) => scenario.write(name, configWrapper(provider));
