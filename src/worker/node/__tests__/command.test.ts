import { createServer, type Server } from "node:net";
import { afterAll, beforeAll, expect, test } from "vitest";
import { commandTo } from "../command.ts";

/** What main's command server answers each command line with. */
let answer = (line: string) => line;
let server: Server;
let port = 0;

beforeAll(async () => {
  server = createServer((socket) => {
    socket.setEncoding("utf8");
    // A connection the worker closed (its answer wasn't JSON).
    socket.on("error", () => undefined);
    let buffered = "";
    socket.on("data", (chunk: string) => {
      buffered += chunk;
      for (
        let at = buffered.indexOf("\n");
        at !== -1;
        at = buffered.indexOf("\n")
      ) {
        socket.write(`${answer(buffered.slice(0, at))}\n`);
        buffered = buffered.slice(at + 1);
      }
    });
  });
  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  port = typeof address === "object" && address ? address.port : 0;
});

afterAll(() => {
  server.close();
});

/** A command to the test's server. */
const command = () =>
  commandTo(() => ({ port, token: "t", project: "p" }))(
    "locate" as never,
    {} as never,
  );

/** Main's answer to a command line: `result`, for the line's id. */
const answering = (result: unknown) => (line: string) => {
  const { id } = JSON.parse(line) as { id: number };
  return JSON.stringify({ id, result });
};

test("main's answer: the command's result", async () => {
  answer = answering("done");
  await expect(command()).resolves.toBe("done");
});

test("an answer that isn't JSON: the waiting command fails with the plugin's bug, the worker doesn't; the next command connects again", async () => {
  const send = commandTo(() => ({ port, token: "t", project: "p" }));
  answer = () => "not JSON";
  await expect(send("locate" as never, {} as never)).rejects.toMatchObject({
    message: expect.stringMatching(
      /^\[@lotun\/vitest-cucumber\] main's answer to a command isn't JSON \(a bug in @lotun\/vitest-cucumber/,
    ) as string,
    cause: expect.any(SyntaxError) as SyntaxError,
  });
  answer = answering("again");
  await expect(send("locate" as never, {} as never)).resolves.toBe("again");
});
