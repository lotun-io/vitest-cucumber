// Node mode's command to main (`../../types/commands.ts`): the same syntax as a page's browser
// command (`../browser/command.ts`), over a TCP connection to main's command server
// (`../../core/commands/server.ts`), at the port main provided (`vitestCucumber.command`), with its
// token, for this worker's project (its name). One connection per worker, opened by its first command; it doesn't keep the worker alive while no
// command waits (`unref`). Node only.
import { connect, type Socket } from "node:net";
import { createInterface } from "node:readline";
import { inject } from "vitest";
import type { Actions, Command } from "../../types/commands.ts";
import type {} from "../../types/providedContext.ts";
import { pluginError } from "../../utils/errors.ts";

/** An answer from main: a result, or the failure its command rejects with. */
type Answer =
  | { id: number; result: unknown }
  | { id: number; error: { name: string; message: string } };

const waiting = new Map<
  number,
  { resolve: (result: unknown) => void; reject: (error: Error) => void }
>();
let socket: Socket | undefined;
let nextId = 0;

/** The worker's connection to main, opened once. */
const connection = () => {
  if (socket && !socket.destroyed) {
    return socket;
  }
  const { port } = inject("vitestCucumber").command;
  const opened = connect(port, "127.0.0.1");
  // Node's line reader: an answer per line.
  createInterface({ input: opened, crlfDelay: Infinity }).on("line", (line) => {
    const answer = JSON.parse(line) as Answer;
    const call = waiting.get(answer.id);
    waiting.delete(answer.id);
    if ("error" in answer) {
      const error = new Error(answer.error.message);
      error.name = answer.error.name;
      call?.reject(error);
    } else {
      call?.resolve(answer.result);
    }
    if (waiting.size === 0) {
      opened.unref();
    }
  });
  // The connection lost: every command waiting fails.
  const fail = (error: Error) => {
    for (const call of waiting.values()) {
      call.reject(error);
    }
    waiting.clear();
  };
  opened.on("error", fail);
  opened.on("close", () => {
    fail(pluginError("the connection to Vitest closed", { quiet: true }));
  });
  socket = opened;
  return opened;
};

/** Calls main with `action`: its answer (main's failure fails it, with its name and message). */
export const command: Command = <Action extends keyof Actions>(
  action: Action,
  options: Actions[Action][0],
) =>
  new Promise<Actions[Action][1]>((resolve, reject) => {
    const id = nextId++;
    const opened = connection();
    waiting.set(id, {
      resolve: resolve as (result: unknown) => void,
      reject,
    });
    // Kept alive while an answer is awaited.
    opened.ref();
    const {
      command: { token },
      projectName: project,
    } = inject("vitestCucumber");
    opened.write(
      `${JSON.stringify({
        id,
        token,
        project,
        action,
        options,
      })}\n`,
    );
  });
