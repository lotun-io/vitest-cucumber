// Browser mode's `RuntimeEnvironment` (`../../types/runtimeEnvironment.ts`): the plugin's copy of
// cucumber's attachment manager (`./attachmentManager.ts`), uncaught errors from `window`'s `error`
// (`./uncaughtErrors.ts`), and the page's scope (`pageScope`). Page-safe.
import type { ModeEnvironment, Scope } from "../../types/runtimeEnvironment.ts";
import { BrowserAttachmentManager } from "./attachmentManager.ts";
import { createUncaughtErrors } from "./uncaughtErrors.ts";

/**
 * The page's scope (`../cucumber/scope.ts`): a page has no `AsyncLocalStorage`, so the World and the
 * context are variables, and a timed-out step that keeps running sees the next one's. A test case's
 * World stays until it ends (its hooks and steps in turn).
 */
const pageScope = (): Scope => {
  let world: object | undefined;
  let context: object | undefined;
  return {
    world: () => world,
    context: () => context,
    withWorld: (current, run) => {
      world = current;
      return run();
    },
    withContext: async (current, run) => {
      context = current;
      try {
        return await run();
      } finally {
        context = undefined;
      }
    },
    endTestCase: () => {
      world = undefined;
    },
  };
};

export const createRuntimeEnvironment = (): ModeEnvironment => ({
  AttachmentManager: BrowserAttachmentManager,
  uncaught: createUncaughtErrors(),
  scope: pageScope(),
});
