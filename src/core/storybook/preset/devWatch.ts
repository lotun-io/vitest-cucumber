// `storybook dev`: what the plugin does as the dev server's watcher reports a file added, changed
// or deleted. Storybook and Vite handle a file's own change themselves (a hot update, the index
// made again); the rest, what they can't know, the plans say (Storybook's, which tell the feature
// plans first: `../stories/storybookPlans.ts`'s `onFileChange`, `../../feature/plans.ts`), and the
// dev server does. Each module is made again and a page that has it updated (`reloadModule`: no
// module is invalidated by hand):
// - the support files' list changed: the support module (the only module written from the
//   list), whose own hot update reloads the page (`./supportModule.ts`);
// - which feature runs on which stories file changed: the features map, written from that;
// - the text of a linked feature changed: the features map (its text is written in). The map's
//   own hot update tells the page's docs blocks (`../../../worker/storybook/linkedFeatures.ts`);
// - a feature's stories module is out of date (its stories file, the Storybook steps): the
//   feature file's modules made again (its stories module, its feature module), and Storybook's
//   index told of it (`../preset.ts`'s server channel hook: its index follows the stories
//   files' own changes only).
// Nothing is written or touched on disk: a touched file is a change to every watcher (the
// addon's Vitest answers each with a run: a saved stories file ran its features twice, traced
// 2026-11-18). The addon's Vitest, another process, makes a run's feature modules again at the
// run's start (`../../plugin/createPlugin.ts`).
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
    "storybookPlans" | "onLinkedFeaturesChanged" | "indexOutOfDate"
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

  project.onLinkedFeaturesChanged(() => reload(featuresMapId));

  /** A file was added, changed or deleted: the plans told, then what they leave to do. */
  const fileChanged = async (
    type: "add" | "change" | "unlink",
    file: string,
  ) => {
    const { supportFilesChanged, staleFeatures, docsChanged } =
      await project.storybookPlans.onFileChange(type, file);
    if (supportFilesChanged) {
      await reload(previewSupportId);
    }
    if (docsChanged) {
      await reload(featuresMapId);
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
