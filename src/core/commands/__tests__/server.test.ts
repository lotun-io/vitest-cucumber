import { connect } from "node:net";
import { createInterface } from "node:readline";
import { afterEach, expect, test } from "vitest";
import { startCommandServer, type Answer } from "../server.ts";

let close: (() => Promise<void>) | undefined;

afterEach(async () => {
  await close?.();
  close = undefined;
});

/**
 * A server answering with `answer`, and a client of it: `send` a request (with the server's token
 * unless it has its own), `write` a raw line, each answer by id, the connection's end.
 */
const connected = async (answer: Answer) => {
  const server = await startCommandServer(answer);
  close = server.close;
  const socket = connect(server.port, "127.0.0.1");
  const answers = new Map<number, (answer: unknown) => void>();
  createInterface({ input: socket }).on("line", (line) => {
    const parsed = JSON.parse(line) as { id: number };
    answers.get(parsed.id)?.(parsed);
  });
  const closed = new Promise<void>((resolve) =>
    socket.on("close", () => resolve()),
  );
  const send = (request: { id: number; [key: string]: unknown }) =>
    new Promise((resolve) => {
      answers.set(request.id, resolve);
      socket.write(
        `${JSON.stringify({ token: server.token, project: "0", ...request })}\n`,
      );
    });
  const write = (line: string) => socket.write(`${line}\n`);
  return { send, write, closed, socket };
};

test("a request's answer: its result, by its id (none as null)", async () => {
  const { send, socket } = await connected(({ project, action, options }) =>
    action === "locate" ? { project, options } : undefined,
  );
  expect(await send({ id: 1, action: "locate", options: { a: 1 } })).toEqual({
    id: 1,
    result: { project: "0", options: { a: 1 } },
  });
  expect(await send({ id: 2, action: "messages", options: {} })).toEqual({
    id: 2,
    result: null,
  });
  socket.destroy();
});

test("a failing request: its error's name and message", async () => {
  const { send, socket } = await connected(() => {
    throw new TypeError("no such thing");
  });
  expect(await send({ id: 7, action: "locate", options: {} })).toEqual({
    id: 7,
    error: { name: "TypeError", message: "no such thing" },
  });
  socket.destroy();
});

test("requests in flight together: each answered by its own id", async () => {
  const { send, socket } = await connected(async ({ options }) => {
    const { wait, value } = options as { wait: number; value: string };
    await new Promise((resolve) => setTimeout(resolve, wait));
    return value;
  });
  const [slow, fast] = await Promise.all([
    send({ id: 1, action: "locate", options: { wait: 30, value: "slow" } }),
    send({ id: 2, action: "locate", options: { wait: 0, value: "fast" } }),
  ]);
  expect(slow).toEqual({ id: 1, result: "slow" });
  expect(fast).toEqual({ id: 2, result: "fast" });
  socket.destroy();
});

test.each([
  ["a line that isn't JSON", "not json"],
  ["a line that isn't a request", JSON.stringify({ hello: "world" })],
  [
    "a request without the server's token",
    JSON.stringify({ id: 4, token: "a guess", project: "0", action: "locate" }),
  ],
])("%s: not answered, its connection closed", async (_, line) => {
  let answered = false;
  const { write, closed } = await connected(() => {
    answered = true;
  });
  write(line);
  await closed;
  expect(answered).toBe(false);
});
