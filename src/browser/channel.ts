// FIFO async task queue between the Node command and the browser pull-loop.
import type { ResultItem } from "../utils/runCucumber.ts";
import type { SerializedError } from "../utils/serializeError.ts";
import type {
  BodyResult,
  HookArg,
  HookInfo,
  HookKind,
  ParameterTypeInfo,
  StepInfo,
  TestRunHooksInfo,
} from "./cucumberShim.ts";

// The wire contract: each task kind's request payload and reply result. One map
// keeps `dispatch`, the pull loop and every `dispatch*` helper type-safe with no
// casts at the call sites.
export type TaskMap = {
  getRegistry: {
    payload: undefined;
    result: {
      steps: StepInfo[];
      hooks: HookInfo[];
      testRunHooks: TestRunHooksInfo;
      parameterTypes: ParameterTypeInfo[];
      defaultTimeout?: number;
    };
  };
  newWorld: { payload: unknown; result: undefined };
  step: { payload: { pattern: string; args: unknown[] }; result: BodyResult };
  hook: {
    payload: { kind: HookKind; index: number; arg: HookArg };
    result: BodyResult;
  };
  testRunHook: {
    payload: {
      kind: "beforeAll" | "afterAll";
      index: number;
      parameters: unknown;
    };
    result: BodyResult;
  };
  transform: {
    payload: { name: string; groups: string[] };
    result: BodyResult;
  };
  testCaseFinished: { payload: ResultItem; result: undefined };
};

export type TaskKind = keyof TaskMap;

// A pulled task, discriminated on `kind` so its `payload` narrows automatically.
export type ChannelTask = {
  [K in TaskKind]: { id: string; kind: K; payload: TaskMap[K]["payload"] };
}[TaskKind];

export class BrowserChannel {
  private queue: ChannelTask[] = [];
  private pending = new Map<string, PromiseWithResolvers<unknown>>();
  private waitingPull: PromiseWithResolvers<ChannelTask | null> | undefined;
  private finished = false;

  dispatch<K extends TaskKind>(
    kind: K,
    payload: TaskMap[K]["payload"],
  ): Promise<TaskMap[K]["result"]> {
    const task = { id: crypto.randomUUID(), kind, payload } as ChannelTask;
    const resolvers = Promise.withResolvers<unknown>();
    this.pending.set(task.id, resolvers);
    if (this.waitingPull) {
      // Hand the task directly to the waiting pull.
      this.waitingPull.resolve(task);
      this.waitingPull = undefined;
    } else {
      this.queue.push(task);
    }
    return resolvers.promise as Promise<TaskMap[K]["result"]>;
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

  report(id: string, result: unknown, err?: SerializedError): void {
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
