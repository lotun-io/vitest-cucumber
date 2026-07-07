// Node-side dispatch helpers for bridged step/hook proxies.
import { AsyncLocalStorage } from "node:async_hooks";
import { globalRef } from "../utils/globals.ts";
import type { BrowserChannel } from "./channel.ts";
import type {
  HookArg,
  HookInfo,
  ParameterTypeInfo,
  StepInfo,
  TestRunHooksInfo,
} from "./cucumberShim.ts";

// ALS instance lives on globalThis so both module runners (command + loadSupport)
// share the same instance across their separate module scopes.
const getRunContext = (): AsyncLocalStorage<BrowserChannel> => {
  globalRef.__vitest_cucumber_browser__ ??= {};
  return (globalRef.__vitest_cucumber_browser__.runContext ??=
    new AsyncLocalStorage<BrowserChannel>());
};

// Runs a Cucumber run with its channel bound for the duration; every dispatch*
// helper invoked beneath it (through awaits) resolves to this channel.
export const runWithChannel = <T>(channel: BrowserChannel, fn: () => T): T =>
  getRunContext().run(channel, fn);

// Returns the channel bound to the current async context, or undefined outside a run.
export const getCurrentChannel = (): BrowserChannel | undefined =>
  getRunContext().getStore();

const channel = (): BrowserChannel => {
  const current = getRunContext().getStore();
  if (!current) {
    throw new Error("No browser channel is bound for the Cucumber run.");
  }
  return current;
};

export const dispatchGetRegistry = (): Promise<{
  steps: StepInfo[];
  hooks: HookInfo[];
  testRunHooks: TestRunHooksInfo;
  parameterTypes: ParameterTypeInfo[];
  defaultTimeout?: number;
}> => channel().dispatch("getRegistry", undefined);

export const dispatchTransform = (
  name: string,
  groups: string[],
): Promise<unknown> => channel().dispatch("transform", { name, groups });

export const dispatchNewWorld = (parameters: unknown): Promise<unknown> =>
  channel().dispatch("newWorld", parameters);

export const dispatchStep = (
  pattern: string,
  args: unknown[],
): Promise<unknown> => channel().dispatch("step", { pattern, args });

export const dispatchHook = (
  kind: "before" | "after" | "beforeStep" | "afterStep",
  index: number,
  arg: HookArg,
): Promise<unknown> => channel().dispatch("hook", { kind, index, arg });

export const dispatchTestRunHook = (
  kind: "beforeAll" | "afterAll",
  index: number,
  parameters: unknown,
): Promise<unknown> =>
  channel().dispatch("testRunHook", { kind, index, parameters });
