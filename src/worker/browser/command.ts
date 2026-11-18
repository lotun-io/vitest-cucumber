// The page's command to main (Vitest's browser command `vitestCucumber`, see
// `../../types/commands.ts`: where its support code's calls were made, the run's
// messages), for every Vitest page (`./pageHost.ts`: browser mode's, story
// tests').
import { commands } from "vitest/browser";
import type { Actions, Command } from "../../types/commands.ts";

declare module "vitest/browser" {
  interface BrowserCommands {
    vitestCucumber: Command;
  }
}

/** Calls main with `action`: its answer (main's failure fails it, with its name and message). */
export const command = <Action extends keyof Actions>(
  action: Action,
  options: Actions[Action][0],
): Promise<Actions[Action][1]> => commands.vitestCucumber(action, options);
