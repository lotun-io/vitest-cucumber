/**
 * FIFO async channel between the Node command and the browser pull-loop.
 *
 * The Node side `dispatch`es tasks; the browser pulls them in order via the
 * `cucumberNextTask` command, runs each in the page, and posts the result back
 * via `cucumberReportTask`. Step/hook/registry tasks are dispatched and awaited
 * one at a time; the real run additionally streams `testCaseFinished` events
 * (fire-and-forget from Node) so the browser resolves each test the moment its
 * scenario finishes — so the channel is a queue, not a single slot. No browser-
 * provider API is used — only Vitest commands — so this works with any provider.
 */

import type { SerializedError } from "../utils/serializeError.ts";

export interface ChannelTask {
  id: number;
  kind:
    | "getSteps"
    | "getHooks"
    | "getTestRunHooks"
    | "getParameterTypes"
    | "getDefaultTimeout"
    | "newWorld"
    | "step"
    | "hook"
    | "testRunHook"
    | "transform"
    | "testCaseFinished";
  payload?: unknown;
}

export class BrowserChannel {
  private nextId = 1;
  private queue: ChannelTask[] = [];
  private pending = new Map<number, PromiseWithResolvers<unknown>>();
  private waitingPull: PromiseWithResolvers<ChannelTask | null> | undefined;
  private finished = false;

  dispatch(kind: ChannelTask["kind"], payload?: unknown): Promise<unknown> {
    const task: ChannelTask = { id: this.nextId++, kind, payload };
    const resolvers = Promise.withResolvers<unknown>();
    this.pending.set(task.id, resolvers);
    if (this.waitingPull) {
      // A pull is parked and the queue is empty: hand the task over directly.
      this.waitingPull.resolve(task);
      this.waitingPull = undefined;
    } else {
      this.queue.push(task);
    }
    return resolvers.promise;
  }

  next(): Promise<ChannelTask | null> {
    const task = this.queue.shift();
    if (task) {
      return Promise.resolve(task);
    }
    if (this.finished) {
      return Promise.resolve(null);
    }
    this.waitingPull = Promise.withResolvers<ChannelTask | null>();
    return this.waitingPull.promise;
  }

  report(id: number, result: unknown, err?: SerializedError): void {
    const resolvers = this.pending.get(id);
    if (!resolvers) {
      return;
    }
    this.pending.delete(id);
    if (err) {
      const revived = new Error(err.message);
      Object.assign(revived, err);
      resolvers.reject(revived);
    } else {
      resolvers.resolve(result);
    }
  }

  finish(): void {
    this.finished = true;
    this.waitingPull?.resolve(null);
    this.waitingPull = undefined;
  }
}
