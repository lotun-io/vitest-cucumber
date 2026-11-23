// Storybook imports a project's `.storybook/main.ts` by its path (`importModule`, no query), and Node
// keeps an imported module for the life of the process. An e2e worker runs every scenario of its
// feature file in one process, a Storybook project's runs in the same folder (`./kept.ts`), each
// scenario's `.storybook/main.ts` holding its own options (the addon entry's: `./storybookProject.ts`):
// the next scenario's Vitest would get the first one's. So this worker imports a scenario project's
// `.storybook/main.ts` by its text's hash: the same text, the module Node has; another, imported
// again. A user's Storybook starts a new process as `main.ts` changes. Storybook's own builds and dev
// servers run in processes of their own (`./storybookStatic.ts`).
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
// eslint-disable-next-line n/no-unsupported-features/node-builtins -- the e2e harness, on Node 24+ (a release candidate there).
import { registerHooks } from "node:module";
import { fileURLToPath } from "node:url";

/** A scenario project's Storybook config, in the e2e folders (`tmp/e2e/`). */
const scenarioMain = /\/tmp\/e2e\/.*\/\.storybook\/main\.ts$/;

registerHooks({
  resolve(specifier, context, nextResolve) {
    const resolved = nextResolve(specifier, context);
    if (!scenarioMain.test(resolved.url)) {
      return resolved;
    }
    const hash = createHash("sha256")
      .update(readFileSync(fileURLToPath(resolved.url)))
      .digest("hex")
      .slice(0, 16);
    return { ...resolved, url: `${resolved.url}?content=${hash}` };
  },
});
