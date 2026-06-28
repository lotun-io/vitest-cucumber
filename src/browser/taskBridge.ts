/**
 * Node-side dispatch helpers used by the bridged step/hook proxies.
 *
 * They publish a task onto the currently-bound `BrowserChannel`; the browser
 * pull-loop executes it in the page and reports the result back. The active
 * channel is set per run by the `cucumberRun` command.
 */

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

// The active run's channel is carried in an AsyncLocalStorage context, not a
// single global slot: several Cucumber runs can be in flight at once (e.g. every
// isolated feature file fires its AfterAll teardown at worker cleanup), and a
// shared slot would let them clobber each other's binding. The ALS instance
// lives on globalThis because the command and loadSupport are evaluated through
// different module runners, so a module-level variable would not be shared.
const getRunContext = (): AsyncLocalStorage<BrowserChannel> => {
  globalRef.__vitest_cucumber_browser__ ??= {};
  return (globalRef.__vitest_cucumber_browser__.runContext ??=
    new AsyncLocalStorage<BrowserChannel>());
};

// Runs a Cucumber run with its channel bound for the duration; every dispatch*
// helper invoked beneath it (through awaits) resolves to this channel.
export const runWithChannel = <T>(channel: BrowserChannel, fn: () => T): T =>
  getRunContext().run(channel, fn);

const channel = (): BrowserChannel => {
  const current = getRunContext().getStore();
  if (!current) {
    throw new Error("No browser channel is bound for the Cucumber run.");
  }
  return current;
};

// The Node-side World for the in-flight step/hook (its `this`). Captured by the
// bridged proxies so the `cucumberAttach` command can replay browser attachments
// via the real `this.attach` while that step/hook is still executing.
type NodeWorld = {
  attach: (data: unknown, mediaTypeOrOptions?: unknown) => void;
};
let currentNodeWorld: NodeWorld | undefined;
export const setCurrentNodeWorld = (world: unknown): void => {
  currentNodeWorld = world as NodeWorld | undefined;
};
export const getCurrentNodeWorld = (): NodeWorld | undefined =>
  currentNodeWorld;

export const dispatchGetSteps = (): Promise<StepInfo[]> =>
  channel().dispatch("getSteps") as Promise<StepInfo[]>;

export const dispatchGetHooks = (): Promise<HookInfo[]> =>
  channel().dispatch("getHooks") as Promise<HookInfo[]>;

export const dispatchGetTestRunHooks = (): Promise<TestRunHooksInfo> =>
  channel().dispatch("getTestRunHooks") as Promise<TestRunHooksInfo>;

export const dispatchGetParameterTypes = (): Promise<ParameterTypeInfo[]> =>
  channel().dispatch("getParameterTypes") as Promise<ParameterTypeInfo[]>;

export const dispatchTransform = (
  name: string,
  groups: string[],
): Promise<unknown> => channel().dispatch("transform", { name, groups });

export const dispatchGetDefaultTimeout = (): Promise<number | undefined> =>
  channel().dispatch("getDefaultTimeout") as Promise<number | undefined>;

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
