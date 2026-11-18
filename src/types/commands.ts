// The plugin's commands from where cucumber runs to Vitest's main process: the same actions and
// syntax (`command(action, options)`, resolving to the answer) on two transports. A page (browser
// mode, Storybook's story tests) calls Vitest's browser command `vitestCucumber`
// (`../worker/browser/command.ts`); a node worker calls main's command server over TCP
// (`../worker/node/command.ts`). Main answers both alike (`../core/commands/actions.ts`). A failure
// is the command's: the caller gets its error (its name and message).
import type { MessageBatch } from "./messages.ts";
import type { DefinitionLocation } from "./supportCode.ts";

/** The actions, each with its options and its answer. */
export interface Actions {
  /**
   * Where a page's support code's calls were made: each recorded stack's first frame that isn't the
   * plugin's, mapped back to its source with the browser's source maps (its path from the project's
   * root, as cucumber writes a definition's `uri`); none for a stack without one.
   */
  locate: [
    { stacks: (string | undefined)[] },
    (DefinitionLocation | undefined)[],
  ];
  /** A batch of the run's Cucumber Messages (sent when the run's stream has a subscriber). */
  messages: [{ batch: MessageBatch }, null];
}

/** A command: an action with its options, resolving to its answer. */
export type Command = <Action extends keyof Actions>(
  action: Action,
  options: Actions[Action][0],
) => Promise<Actions[Action][1]>;
