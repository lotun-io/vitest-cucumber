// Storybook: the preview's Vite plugin (Storybook's own process: `storybook dev`, `storybook build`;
// the preset's `viteFinal` adds it). It gives the preview the plugin's `@cucumber/cucumber`, each
// feature module a stories module imports (parsed here, its pickles written in: `../stories/featureRuntimeModule.ts`),
// the support module (the placeholder's import, by an id of its own: `./supportModule.ts`; made again
// as support files are added or deleted: `./devWatch.ts`), and a feature file Storybook's
// `stories` list as its stories module (its stories file's meta, a story per scenario:
// `../stories/featureStories.ts`). In `storybook dev`: definition locations (`./locate.ts`), and the
// dev server's watcher (`./devWatch.ts`: the features made again as a file changes their stories module).
// A feature that can't be used has its error on its plan, and its module gives it (`../../feature/plans.ts`).
import path from "node:path";
import type { Plugin } from "vitest/config";
import type {
  LocateRequest,
  LocateResponse,
} from "../../../types/storybook.ts";
import { locatedEvent, locateEvent } from "../../../utils/previewLocate.ts";
import { slash } from "../../../utils/slash.ts";
import {
  pageExcluded,
  resolvePageCucumber,
  runtimeDependencies,
} from "../../browser/pageModules.ts";
import { isFeatureFile } from "../../feature/featureFile.ts";
import {
  featureFileOf,
  featureModulePreview,
} from "../stories/featureRuntimeModule.ts";
import { storiesModulePreview } from "../stories/featureStoriesModule.ts";
import { watchDevServer } from "./devWatch.ts";
import {
  featuresMapId,
  isFeaturesMap,
  mayBeFeaturesMap,
} from "./featuresModule.ts";
import { createLocator } from "./locate.ts";
import { type PresetOptions, projectOf } from "./project.ts";
import {
  isPreviewSupport,
  mayBePreviewSupport,
  previewSupportId,
  supportModuleCode,
} from "./supportModule.ts";

/** The preview's Vite plugin, for the project at Storybook's working directory. */
export const storybookPreviewPlugin = (options: PresetOptions): Plugin => {
  const project = projectOf(options);
  const { root, storybookPlans: plans } = project;
  /** Whether Vite builds (`storybook build`), not serves (`storybook dev`). */
  let building = false;
  return {
    name: "vitest-cucumber:storybook-preview",
    enforce: "pre",
    configResolved: (config) => {
      building = config.command === "build";
    },
    // The runtime's packages, pre-bundled at startup (as browser mode's: `../../browserPlugin.ts`; the
    // preview throws the original errors and sends no messages: no Vitest serialization), and the
    // support files for Vite's scanner, which Storybook gives the stories (a feature file among
    // them, which it can't read): whole paths, Storybook's Vite root being its own to choose.
    config: () => ({
      optimizeDeps: {
        include: runtimeDependencies,
        exclude: pageExcluded,
        entries: project.supportGlobs.map((glob) =>
          path.isAbsolute(glob)
            ? slash(glob)
            : path.posix.join(slash(root), slash(glob)),
        ),
      },
    }),
    // `storybook dev`: the page's definition calls located with the served modules' source maps,
    // as main locates browser mode's (`./locate.ts`).
    configureServer: (server) => {
      // Always answered: an error is sent back (a handler's throw would only be logged here, the
      // page waiting for an answer).
      const locate = createLocator(server, root);
      server.ws.on(locateEvent, (request: LocateRequest, client) => {
        void locate(request).then(
          (response) => {
            client.send(locatedEvent, response);
          },
          (error: unknown) => {
            client.send(locatedEvent, {
              id: request.id,
              error: String(error),
            } satisfies LocateResponse);
          },
        );
      });
      // The files Storybook and Vite can't know to follow (`./devWatch.ts`).
      watchDevServer({ server, project });
    },
    // A feature module (a stories module's import of it); a placeholder's import, its module's own
    // id (the support module: `./supportModule.ts`; the features map: `./featuresModule.ts`); else
    // the page's `@cucumber/cucumber`.
    async resolveId(source, importer) {
      if (featureFileOf(source)) {
        return source;
      }
      if (mayBePreviewSupport(source) || mayBeFeaturesMap(source)) {
        const resolved = await this.resolve(source, importer, {
          skipSelf: true,
        });
        if (resolved && isPreviewSupport(resolved.id)) {
          return previewSupportId;
        }
        if (resolved && isFeaturesMap(resolved.id)) {
          return featuresMapId;
        }
      }
      return resolvePageCucumber(source);
    },
    // A feature file (one of Storybook's `stories`): its stories module (one that can't be made: its error's).
    transform: async (_code, id) => {
      if (!isFeatureFile(id)) {
        return undefined;
      }
      const code = storiesModulePreview(await plans.storybookPlanOf(id));
      return { code, map: { mappings: "" } };
    },
    async load(id) {
      const file = featureFileOf(id);
      if (file) {
        // The same plan as its stories module's (its id is the feature file's with a query, so
        // Vite makes both again as the file changes).
        return featureModulePreview(await plans.storybookPlanOf(file));
      }
      if (id === featuresMapId) {
        // Reloaded by the dev server as it would be another (a linked feature's text, the links:
        // `./devWatch.ts`).
        // Nothing caught: whatever goes wrong here is told (a build stops, `storybook dev` shows it).
        return project.featuresMap.load();
      }
      if (id === previewSupportId) {
        const plan = await plans.storybookSupportPlanOf();
        // The project's support code can't be listed or read (its files, their Storybook steps):
        // nothing can run, so it fails loudly: a build stops, `storybook dev` reports the error.
        if ("error" in plan) {
          throw plan.error;
        }
        // The root only where it's read: `storybook dev`'s files outside it, served from their
        // whole paths (`/@fs/…`: `../../../worker/storybook/preview/locate.ts`). A static build's
        // frames are its assets', and it's published: no path of the machine that built it.
        return supportModuleCode({ cwd: building ? "." : root, plan });
      }
      return undefined;
    },
  };
};
