// Browser mode's transport of the commands (`../../types/commands.ts`), main's side: Vitest's
// browser command `vitestCucumber`, answered by main's actions (`./actions.ts`).
import type { BrowserCommand } from "vitest/node";
import type { Actions } from "../../types/commands.ts";
import type { createActions } from "./actions.ts";

/** The browser command the pages call, answered by `actions`. */
export const browserCommands = (actions: ReturnType<typeof createActions>) => {
  /** An action's answer; a failure fails the page's command (Vitest gives it the error). */
  const vitestCucumber: BrowserCommand<[keyof Actions, never]> = (
    { project },
    action,
    options,
  ) => Promise.resolve().then(() => actions.answer(project, action, options));
  return { vitestCucumber };
};
