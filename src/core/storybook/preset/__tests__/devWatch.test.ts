import { EventEmitter } from "node:events";
import { expect, test, vi } from "vitest";
import { watchDevServer } from "../devWatch.ts";
import { featuresMapId } from "../featuresModule.ts";
import { previewSupportId } from "../supportModule.ts";

const settled = () => new Promise((resolve) => setTimeout(resolve, 20));

/** A feature file, and its two modules' ids (its stories module, its feature module). */
const feature = "/p/src/A.feature";
const featureModules = [feature, `${feature}?vitest-cucumber-storybook`];

/**
 * A dev server's watcher on a fake server (its modules: `ids`, by id; a file's modules those whose
 * id is the file's, any query) and fake plans (the feature plans', then Storybook's, each
 * answering an event with `feature` and `storybook`; failing it with `failure` if any): what was
 * done, in order (`log`), and the project's listener of changed links.
 */
const devWatch = ({
  ids = [],
  feature: featureAnswer = { supportFilesChanged: false },
  storybook = { staleFeatures: [], docsChanged: false },
  failure,
}: {
  ids?: string[];
  feature?: { supportFilesChanged: boolean };
  storybook?: { staleFeatures: string[]; docsChanged: boolean };
  failure?: Error;
} = {}) => {
  const log: string[] = [];
  const watcher = new EventEmitter();
  const modules = new Map(ids.map((id) => [id, { id }]));
  const error = vi.fn();
  const listeners: { linkedFeaturesChanged?: () => Promise<void> } = {};
  watchDevServer({
    server: {
      watcher,
      environments: {
        client: {
          reloadModule: ({ id }: { id: string }) => {
            log.push(`reload ${id}`);
            return Promise.resolve();
          },
          moduleGraph: {
            getModuleById: (id: string) => modules.get(id),
            getModulesByFile: (file: string) => {
              const its = [...modules.values()].filter(
                ({ id }) => id.split("?")[0] === file,
              );
              return its.length > 0 ? new Set(its) : undefined;
            },
          },
        },
      },
      config: { logger: { error } },
    },
    project: {
      plans: {
        onFileChange: (type: string, file: string) => {
          log.push(`feature plans: ${type} ${file}`);
          return failure
            ? Promise.reject(failure)
            : Promise.resolve(featureAnswer);
        },
      },
      storybookPlans: {
        onFileChange: (type: string, file: string) => {
          log.push(`Storybook plans: ${type} ${file}`);
          return Promise.resolve(storybook);
        },
      },
      onLinkedFeaturesChanged: (listener: () => Promise<void>) => {
        listeners.linkedFeaturesChanged = listener;
      },
      indexOutOfDate: (features: string[]) => {
        if (features.length > 0) {
          log.push(`index out of date: ${features.join(", ")}`);
        }
        return Promise.resolve();
      },
    },
  } as unknown as Parameters<typeof watchDevServer>[0]);
  return { watcher, log, error, listeners };
};

test("every file added, changed or deleted goes to the feature plans, then to Storybook's; nothing left to do: nothing done", async () => {
  const { watcher, log } = devWatch({
    ids: [featuresMapId, previewSupportId, ...featureModules],
  });
  watcher.emit("change", "/p/src/A.stories.ts");
  await settled();
  watcher.emit("unlink", "/p/src/A.tsx");
  await settled();
  expect(log).toEqual([
    "feature plans: change /p/src/A.stories.ts",
    "Storybook plans: change /p/src/A.stories.ts",
    "feature plans: unlink /p/src/A.tsx",
    "Storybook plans: unlink /p/src/A.tsx",
  ]);
});

test("the support files' list changed: the support module reloaded (its hot update reloads the page)", async () => {
  const { watcher, log } = devWatch({
    ids: [previewSupportId, ...featureModules, featuresMapId],
    feature: { supportFilesChanged: true },
  });
  watcher.emit("add", "/p/steps/more.ts");
  await settled();
  expect(log.slice(2)).toEqual([`reload ${previewSupportId}`]);
});

test("which feature runs on which stories file changed: the features map reloaded", async () => {
  const { log, listeners } = devWatch({ ids: [featuresMapId] });
  await listeners.linkedFeaturesChanged?.();
  expect(log).toEqual([`reload ${featuresMapId}`]);
});

test("a linked feature's text changed: the features map reloaded (its own hot update tells the docs blocks), nothing else", async () => {
  const { watcher, log } = devWatch({
    ids: [featuresMapId, ...featureModules],
    storybook: { staleFeatures: [], docsChanged: true },
  });
  watcher.emit("change", feature);
  await settled();
  expect(log.slice(2)).toEqual([`reload ${featuresMapId}`]);
});

test("feature files out of date: each one's modules reloaded (its stories module, its feature module), then Storybook's index told of them", async () => {
  const { watcher, log } = devWatch({
    ids: [featuresMapId, previewSupportId, ...featureModules],
    storybook: { staleFeatures: [feature], docsChanged: false },
  });
  watcher.emit("change", "/p/src/A.stories.ts");
  await settled();
  expect(log.slice(2)).toEqual([
    ...featureModules.map((id) => `reload ${id}`),
    `index out of date: ${feature}`,
  ]);
});

test("a module no page has: not reloaded (Storybook's index told all the same)", async () => {
  const { watcher, log, listeners } = devWatch({
    feature: { supportFilesChanged: true },
    storybook: { staleFeatures: [feature], docsChanged: true },
  });
  await listeners.linkedFeaturesChanged?.();
  watcher.emit("change", "/p/src/A.stories.ts");
  await settled();
  expect(log.slice(2)).toEqual([`index out of date: ${feature}`]);
});

test("the plans fail: the error logged", async () => {
  const { watcher, error } = devWatch({ failure: new Error("no options") });
  watcher.emit("add", "/p/steps/more.ts");
  await settled();
  expect(error).toHaveBeenCalledWith("Error: no options");
});
