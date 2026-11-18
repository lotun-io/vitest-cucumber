// The commands from where cucumber runs to main (`../../types/commands.ts`), answered by main's
// actions (`./actions.ts`) on both transports: a page's Vitest browser command
// (`./browserCommand.ts`), a node worker's TCP connection to the command server (`./server.ts`, one per
// Vitest: started with its first node project, closed and dropped with it). A worker's requests name
// its project (`vitestCucumber.projectName`: Vitest's project names are unique); workers get the
// server's port and token provided (`vitestCucumber.command`).
import type { Vitest } from "vitest/node";
import { pluginError } from "../../utils/errors.ts";
import { createActions } from "./actions.ts";
import { browserCommands } from "./browserCommand.ts";
import { startCommandServer } from "./server.ts";

export const createCommands = ({
  cwd,
}: {
  /** The project's root. */
  cwd: () => string;
}) => {
  const actions = createActions({ cwd });
  /** Node mode's command server, of the open Vitest (none until a node project asks). */
  let server: ReturnType<typeof startCommandServer> | undefined;
  /** Node mode's command server, started once with Vitest's `vitest`: its port and token. */
  const serverOf = async (vitest: Vitest) => {
    if (!server) {
      const started = startCommandServer(({ project, action, options }) => {
        const target = vitest.projects.find(({ name }) => name === project);
        if (!target) {
          throw pluginError(`no project "${project}"`, { internal: true });
        }
        return actions.answer(target, action, options);
      });
      server = started;
      vitest.onClose(async () => {
        if (server === started) {
          server = undefined;
        }
        await (await started).close();
      });
    }
    const { port, token } = await server;
    return { port, token };
  };
  return {
    /** The pages' browser command (`vitestCucumber`). */
    browser: browserCommands(actions),
    /**
     * What a project's workers get (`vitestCucumber.command`): node mode's command server's port and
     * token (with Vitest's `vitest`; the server started once), or none in a page (its commands are
     * Vitest's browser command).
     */
    providedFor: async (vitest?: Vitest) =>
      vitest ? await serverOf(vitest) : { port: 0, token: "" },
  };
};
