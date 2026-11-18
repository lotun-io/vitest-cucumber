// Node mode's transport of the commands (`../../types/commands.ts`), main's side: a TCP server on the
// loopback, answered by main's actions (`./actions.ts`), as a page's browser command is. Workers get
// its port and token provided (`vitestCucumber.command`: `../../types/providedContext.ts`); each
// connects once (`../../worker/node/command.ts`). A request and its answer are a line of JSON each:
// `{ id, token, project, action, options }`, answered `{ id, result }`, or `{ id, error: { name,
// message } }` (the failure the worker's command rejects with, as Vitest gives a page a failed
// command's). Any local process can connect: a line that isn't a request with the server's token
// closes its connection, nothing logged.
import { randomUUID } from "node:crypto";
import { createServer, type Socket } from "node:net";
import { createInterface } from "node:readline";
import type { Actions } from "../../types/commands.ts";

/** A request: an action of a worker of the project `project` (its name, provided it). */
interface Request {
  id: number;
  token: string;
  project: string;
  action: keyof Actions;
  options: never;
}

/** Answers a request (its project's action): its result, or its failure. */
export type Answer = (
  request: Pick<Request, "project" | "action" | "options">,
) => unknown;

/** Writes `value` as a line of JSON, unless the socket can't take it any more (destroyed, ended). */
const writeLine = (socket: Socket, value: unknown) => {
  if (socket.writable) {
    socket.write(`${JSON.stringify(value)}\n`);
  }
};

/** Whether `value` is a request (its fields' types; its action is checked by the actions). */
const isRequest = (value: unknown): value is Request => {
  const request = value as Partial<Request> | null;
  return (
    typeof request === "object" &&
    request !== null &&
    typeof request.id === "number" &&
    typeof request.token === "string" &&
    typeof request.project === "string" &&
    typeof request.action === "string"
  );
};

/** The request `line` is, if it's JSON and a request. */
const requestOf = (line: string) => {
  try {
    const value: unknown = JSON.parse(line);
    return isRequest(value) ? value : undefined;
  } catch {
    return undefined;
  }
};

/**
 * Starts the command server, answering with `answer`: its port, its token (every request's), and how
 * to close it.
 */
export const startCommandServer = async (answer: Answer) => {
  const token = randomUUID();
  const sockets = new Set<Socket>();
  const server = createServer((socket) => {
    sockets.add(socket);
    socket.on("close", () => sockets.delete(socket));
    // A worker that ends (or is killed) closes its connection: nothing to answer.
    socket.on("error", () => {});
    createInterface({ input: socket, crlfDelay: Infinity })
      .on("line", (line) => {
        // Not a worker's: its connection closed.
        const request = requestOf(line);
        if (request?.token !== token) {
          socket.destroy();
          return;
        }
        const { id, project, action, options } = request;
        void Promise.resolve()
          .then(() => answer({ project, action, options }))
          .then(
            (result) => {
              writeLine(socket, { id, result: result ?? null });
            },
            (error: unknown) => {
              writeLine(socket, {
                id,
                error:
                  error instanceof Error
                    ? { name: error.name, message: error.message }
                    : { name: "Error", message: String(error) },
              });
            },
          );
      })
      // A failing socket is destroyed, which closes it; readline passes its error on.
      .on("error", () => {});
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  return {
    port: typeof address === "object" && address ? address.port : 0,
    token,
    close: () =>
      new Promise<void>((resolve) => {
        for (const socket of sockets) {
          socket.destroy();
        }
        server.close(() => resolve());
      }),
  };
};
