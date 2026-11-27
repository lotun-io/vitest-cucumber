// The code of Storybook's preview's support module: the support files' import, and what the page's
// cucumber needs from main, written in as it builds (the preview, dev or a static build, needs no
// server): the project's root, the run's options, and cucumber's version. The page imports the
// placeholder module (`../../../worker/storybook/preview/support.ts`, its exports' types); the preset's
// plugin resolves that import to an id of its own (`previewSupportId`) and serves this code for it.
// Not the placeholder's path: a file in `node_modules`, Vite would serve it with its dependencies'
// version (`?v=`) as `immutable`, and the browser keep it across reloads and restarts (a list of
// support files gone stale); its own id is served `no-cache`.
//
// In `storybook dev` it accepts its own hot update and reloads the page: a support file changed, or
// a module one imports (Vite's walk of the importers ends here: the support files are its dynamic
// imports, so no support code runs for the update). Without it the update ends at Storybook's
// annotations, applied again in place (their `beforeAll` too), but the support code loads once per
// page: only the changed file would run again, on the definitions of the first load.
import { slash } from "../../../utils/slash.ts";
import { cucumberVersion } from "../../plugin/cucumberVersion.ts";
import { importSupportCode } from "../../support/importSupportCode.ts";
import { ownModule } from "../../utils/ownModule.ts";
import { withoutQuery } from "../../utils/withoutQuery.ts";
import type { StorybookSupportPlan } from "../stories/storybookPlans.ts";

/** The placeholder's path, as Vite writes ids (`/`, on Windows too). */
const supportPlaceholder = slash(ownModule("worker/storybook/preview/support"));

/** Whether Vite's module `id` is the placeholder's (any query). */
export const isPreviewSupport = (id: string) =>
  slash(withoutQuery(id)) === supportPlaceholder;

/** Whether an import's `source` may be the placeholder's (`./support.ts`, `./support.mjs`): resolved then. */
export const mayBePreviewSupport = (source: string) =>
  /(?:^|\/)support(?:\.[cm]?[jt]s)?$/.test(withoutQuery(source));

/** The preview's support module's id: not a file (`\0`), Vite serving it as `/@id/__x00__…`. */
export const previewSupportId = "\0vitest-cucumber:storybook-preview-support";

/** Its hot update (the support code changed) reloads the page; no code in a build. */
const reloadOnUpdate =
  "if (import.meta.hot) import.meta.hot.accept(() => location.reload());";

/**
 * The support module's code, for the project at `cwd`, from its support plan
 * (`../stories/storybookPlans.ts`'s `storybookSupportPlanOf`; one that failed is thrown by the preview's
 * plugin, not written: `./previewPlugin.ts`): the support files' import, the run's options.
 */
export const supportModuleCode = ({
  cwd,
  plan,
}: {
  cwd: string;
  plan: StorybookSupportPlan;
}) => {
  const json = JSON.stringify;
  return [
    `export const importSupport = ${importSupportCode(plan.supportFiles)};`,
    `export const options = ${json(plan.options)};`,
    `export const cwd = ${json(cwd)};`,
    `export const version = ${json(cucumberVersion)};`,
    reloadOnUpdate,
  ].join("\n");
};
