// Node mode's `RuntimeEnvironment` (`../../types/runtimeEnvironment.ts`): cucumber's attachment
// manager (`./attachmentManager.ts`, a copy), an uncaught error as cucumber's
// user code runner sees one (`process`' `uncaughtException`, its `uncaught_exception_manager.ts`), and
// cucumber's `world` and `context` on `AsyncLocalStorage`, as cucumber keeps them (a timed-out step
// that keeps running still sees its own). Node only.
import { AsyncLocalStorage } from "node:async_hooks";
import type { ModeEnvironment } from "../../types/runtimeEnvironment.ts";
import { createUncaught } from "../runner/uncaught.ts";
import { NodeAttachmentManager } from "./attachmentManager.ts";

export const createRuntimeEnvironment = (): ModeEnvironment => {
  const worlds = new AsyncLocalStorage<object>();
  const contexts = new AsyncLocalStorage<object>();
  return {
    AttachmentManager: NodeAttachmentManager,
    uncaught: createUncaught((fail) => {
      process.addListener("uncaughtException", fail);
      return () => {
        process.removeListener("uncaughtException", fail);
      };
    }),
    scope: {
      world: () => worlds.getStore(),
      context: () => contexts.getStore(),
      withWorld: (world, run) => worlds.run(world, run),
      withContext: (context, run) => contexts.run(context, run),
      endTestCase: () => undefined,
    },
  };
};
