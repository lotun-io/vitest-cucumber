// `storybook dev`: what the plugin does as the dev server's watcher reports a file added, changed
// or deleted. Storybook and Vite handle a file's own change themselves (a hot update, the index
// made again); the rest, what they can't know, the plans say (Storybook's, which tell the feature
// plans first: `../stories/storybookPlans.ts`'s `onFileChange`, `../../feature/plans.ts`), and the
// dev server does. Each module is made again and a page that has it updated (`reloadModule`: no
// module is invalidated by hand):
// - the support files' list changed: the support module (the only module written from the
//   list), whose own hot update reloads the page (`./supportModule.ts`);
// - the features map would be another (which feature runs on which stories file, a linked
//   feature's text: both written in): made again as the links change and at a feature file's
//   event, and reloaded only if it's another than the one last made (`./featuresModule.ts`).
//   Its own hot update tells the page's docs blocks
//   (`../../../worker/storybook/linkedFeatures.ts`);
// - a feature's stories module is out of date (its stories file, the Storybook steps): the
//   feature file's modules made again (its stories module, its feature module), and Storybook's
//   index told of it (`../preset.ts`'s server channel hook: its index follows the stories
//   files' own changes only).
// Nothing is written or touched on disk: a touched file is a change to every watcher (the
// addon's Vitest answers each with a run: a saved stories file ran its features twice, traced
// 2026-11-18). The addon's Vitest, another process, makes a run's feature modules again at the
// run's start (`../../plugin/createPlugin.ts`).
import { isFeatureFile } from "../../feature/featureFile.ts";
import type { FileChange } from "../../feature/plans.ts";
import { featuresMapId } from "./featuresModule.ts";
import type { DevServer } from "./locate.ts";
import type { projectOf } from "./project.ts";
import { previewSupportId } from "./supportModule.ts";

export const watchDevServer = ({
  server,
  project,
}: {
  server: DevServer;
  project: Pick<
    ReturnType<typeof projectOf>,
    | "storybookPlans"
    | "featuresMap"
    | "onLinkedFeaturesChanged"
    | "indexOutOfDate"
  >;
}) => {
  const graph = server.environments.client.moduleGraph;

  /** Makes module `id` again and updates a page that has it (no page has: nothing). */
  const reload = async (id: string) => {
    const module = graph.getModuleById(id);
    if (module) {
      await server.environments.client.reloadModule(module);
    }
  };

  /** Makes feature file `file`'s modules again (its stories module, its feature module) and updates a page that has them. */
  const reloadFile = async (file: string) => {
    for (const module of graph.getModulesByFile(file) ?? []) {
      await server.environments.client.reloadModule(module);
    }
  };

  /** The features map made again: reloaded if it's another than the one last made. */
  const followFeaturesMap = async () => {
    if (await project.featuresMap.changed()) {
      await reload(featuresMapId);
    }
  };

  project.onLinkedFeaturesChanged(followFeaturesMap);

  /** A file was added, changed or deleted: the plans told, then what they leave to do. */
  const fileChanged = async (type: FileChange, file: string) => {
    const { supportFilesChanged, staleFeatures } =
      await project.storybookPlans.onFileChange(type, file);
    if (supportFilesChanged) {
      await reload(previewSupportId);
    }
    // A feature file's text is written in the features map (the plans read it again by now).
    if (isFeatureFile(file)) {
      await followFeaturesMap();
    }
    await Promise.all(staleFeatures.map(reloadFile));
    await project.indexOutOfDate(staleFeatures);
  };

  for (const type of ["add", "change", "unlink"] as const) {
    server.watcher.on(type, (file) => {
      // An event's handler has no caller to fail: its error logged.
      fileChanged(type, file).catch((error: unknown) => {
        server.config.logger.error(String(error));
      });
    });
  }
};
