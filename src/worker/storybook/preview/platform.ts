// Storybook's preview's platform: cucumber runs in the preview page, in `storybook dev` and in a
// static build alike. What browser mode's page gets from main is in the support module, written in
// as Storybook builds (`./support.ts`): the project's root, the run's options, cucumber's version.
// The page is one worker (`1` of `1`). A definition's location is its call site: mapped by the dev
// server in `storybook dev`, else as the browser has it (`./locate.ts`). Each step's code is a step
// of the story (a failed story's annotations: `./runner.ts`). No default timeouts (cucumber's -1):
// Storybook's preview has none for a play function (it runs until it ends, or the story changes); a
// definition's own `timeout` still applies. No colors (no Vitest). Preview only.
/// <reference types="vite/client" />
import { importPageSupport } from "../../browser/importPageSupport.ts";
import { createPlatform } from "../../platform/createPlatform.ts";
import { originalThrown } from "../../platform/errors/thrown.ts";
import { storyEnvironment } from "../story.ts";
import { locate } from "./locate.ts";
import { version } from "./support.ts";

/** Cucumber's default timeouts in the preview: none, as Storybook's play functions. */
const previewTimeouts = { test: -1, hook: -1 };

export const platform = createPlatform({
  // One run: the page's (no Vitest), one worker.
  worker: () => ({ workerId: "1", totalWorkers: 1, projectName: "" }),
  // Through a variable: Vite would replace a literal `import.meta.env.<name>` at build time. None
  // outside Vite (Node loading this module: the unit tests).
  env: (import.meta.env as Record<string, unknown> | undefined) ?? {},
  importSupport: (importSupport) => importPageSupport(version, importSupport),
  locate,
  environment: () => ({
    ...storyEnvironment(),
    defaultTimeouts: previewTimeouts,
  }),
  colors: () => false,
  // No Vitest: no stream of the run's messages (no `messages`).
  // The originals: Storybook shows the thrown error itself.
  throwable: originalThrown,
});
