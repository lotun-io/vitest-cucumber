import { EventEmitter } from "node:events";
import { expect, test, vi } from "vitest";
import { watchDevServer } from "../devWatch.ts";
import { featuresMapId } from "../featuresModule.ts";
import { previewSupportId } from "../supportModule.ts";

/** Nothing left for the dev server. */
const nothing = {
  supportFilesChanged: false,
  staleFeatures: [] as string[],
};

const settled = () => new Promise((resolve) => setTimeout(resolve, 20));

/** A feature file, and its two modules' ids (its stories module, its feature module). */
const feature = "/p/src/A.feature";
const featureModules = [feature, `${feature}?vitest-cucumber-storybook`];

/**
 * A dev server's watcher on a fake server (its modules: `ids`, by id; a file's modules those whose
 * id is the file's, any query), fake plans (Storybook's, answering an event with `nothing`
 * and `answer`; failing it with `failure` if any) and a fake features map (another than the one
 * last made, or not: `mapChanged`): what was done, in order (`log`), and the project's listener
 * of changed links.
 */
const devWatch = ({
  ids = [],
  answer = {},
  mapChanged = false,
  failure,
}: {
  ids?: string[];
  answer?: Partial<typeof nothing>;
  mapChanged?: boolean;
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
      storybookPlans: {
        onFileChange: (type: string, file: string) => {
          log.push(`plans: ${type} ${file}`);
          return failure
            ? Promise.reject(failure)
            : Promise.resolve({ ...nothing, ...answer });
        },
      },
      featuresMap: {
        changed: () => {
          log.push("features map made again");
          return Promise.resolve(mapChanged);
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

test("every file added, changed or deleted goes to the plans, once; nothing left to do: nothing done", async () => {
  const { watcher, log } = devWatch({
    ids: [featuresMapId, previewSupportId, ...featureModules],
  });
  watcher.emit("change", "/p/src/A.stories.ts");
  await settled();
  watcher.emit("unlink", "/p/src/A.tsx");
  await settled();
  expect(log).toEqual([
    "plans: change /p/src/A.stories.ts",
    "plans: unlink /p/src/A.tsx",
  ]);
});

test("the support files' list changed: the support module reloaded (its hot update reloads the page)", async () => {
  const { watcher, log } = devWatch({
    ids: [previewSupportId, ...featureModules, featuresMapId],
    answer: { supportFilesChanged: true },
  });
  watcher.emit("add", "/p/steps/more.ts");
  await settled();
  expect(log.slice(1)).toEqual([`reload ${previewSupportId}`]);
});

test("which feature runs on which stories file changed: the features map made again, reloaded if it's another", async () => {
  const changed = devWatch({ ids: [featuresMapId], mapChanged: true });
  await changed.listeners.linkedFeaturesChanged?.();
  expect(changed.log).toEqual([
    "features map made again",
    `reload ${featuresMapId}`,
  ]);
  const same = devWatch({ ids: [featuresMapId] });
  await same.listeners.linkedFeaturesChanged?.();
  expect(same.log).toEqual(["features map made again"]);
});

test("a feature file's event: the features map made again after the plans were told, reloaded if it's another (its own hot update tells the docs blocks), nothing else", async () => {
  const changed = devWatch({
    ids: [featuresMapId, ...featureModules],
    mapChanged: true,
  });
  changed.watcher.emit("change", feature);
  await settled();
  expect(changed.log).toEqual([
    `plans: change ${feature}`,
    "features map made again",
    `reload ${featuresMapId}`,
  ]);
  // Saved as it was, or a feature on no stories file: the same map, nothing reloaded.
  const same = devWatch({ ids: [featuresMapId, ...featureModules] });
  same.watcher.emit("change", feature);
  await settled();
  expect(same.log.slice(1)).toEqual(["features map made again"]);
});

test("feature files out of date: each one's modules reloaded (its stories module, its feature module), then Storybook's index told of them", async () => {
  const { watcher, log } = devWatch({
    ids: [featuresMapId, previewSupportId, ...featureModules],
    answer: { staleFeatures: [feature] },
  });
  watcher.emit("change", "/p/src/A.stories.ts");
  await settled();
  expect(log.slice(1)).toEqual([
    ...featureModules.map((id) => `reload ${id}`),
    `index out of date: ${feature}`,
  ]);
});

test("a module no page has: not reloaded (Storybook's index told all the same)", async () => {
  const { watcher, log, listeners } = devWatch({
    answer: { supportFilesChanged: true, staleFeatures: [feature] },
    mapChanged: true,
  });
  await listeners.linkedFeaturesChanged?.();
  watcher.emit("change", "/p/src/A.stories.ts");
  await settled();
  expect(log).toEqual([
    "features map made again",
    "plans: change /p/src/A.stories.ts",
    `index out of date: ${feature}`,
  ]);
});

test("the plans fail: the error logged", async () => {
  const { watcher, error } = devWatch({ failure: new Error("no options") });
  watcher.emit("add", "/p/steps/more.ts");
  await settled();
  expect(error).toHaveBeenCalledWith("Error: no options");
});
