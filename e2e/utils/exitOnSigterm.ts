// A scenario's Vitest worker, while this repository's coverage collects its subprocesses'
// (`coverage.autoAttachSubprocess`, see `../support/config.ts`, which adds it to their `execArgv`).
// Node writes a process's coverage (`NODE_V8_COVERAGE`) as it exits normally, and Vitest stops a
// worker with SIGTERM, then SIGKILL 500 ms later: a write begun at SIGTERM can be cut there, its
// file left empty, which fails the outer run as Vitest reads it ("Unexpected end of JSON input":
// CI, 2026-11-26). So the coverage is written before Vitest stops the worker: as the worker
// answers its `stop` request (`stopped`, its last message: its teardown is done; Vitest waits a
// minute for it and sends SIGTERM only then), where Vitest saves its own compile cache for the
// same reason. Vitest's worker protocol isn't documented: a worker stopped without that answer
// (a forced stop, another Vitest's protocol) exits normally at SIGTERM and writes its coverage
// then, as before. Outside `../support/`: not the outer suite's.
import v8 from "node:v8";

/** Whether `message` is a Vitest worker's answer to its `stop` request. */
const isStopped = (message: unknown) =>
  typeof message === "object" &&
  message !== null &&
  "type" in message &&
  message.type === "stopped";

const send = process.send;
if (send) {
  process.send = (message: unknown, ...rest: unknown[]) => {
    if (isStopped(message)) {
      // Written now; nothing more as the process ends.
      v8.takeCoverage();
      v8.stopCoverage();
    }
    return Reflect.apply(send, process, [message, ...rest]) as boolean;
  };
}

// eslint-disable-next-line n/no-process-exit -- the point: a normal exit, its coverage written.
process.once("SIGTERM", () => process.exit());
