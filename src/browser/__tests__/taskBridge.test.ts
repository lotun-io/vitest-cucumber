import { describe, expect, it, vi } from "vitest";
import { BrowserChannel } from "../channel.ts";
import type { HookArg } from "../cucumberShim.ts";
import {
  dispatchGetDefaultTimeout,
  dispatchGetHooks,
  dispatchGetParameterTypes,
  dispatchGetSteps,
  dispatchGetTestRunHooks,
  dispatchHook,
  dispatchNewWorld,
  dispatchStep,
  dispatchTestRunHook,
  dispatchTransform,
  runWithChannel,
} from "../taskBridge.ts";

describe("taskBridge", () => {
  it("throws when a dispatch happens with no channel bound", () => {
    expect(() => dispatchGetSteps()).toThrow(
      "No browser channel is bound for the Cucumber run.",
    );
  });

  it("dispatches each task kind onto the channel bound for the run", () => {
    const channel = new BrowserChannel();
    const spy = vi.spyOn(channel, "dispatch");

    runWithChannel(channel, () => {
      void dispatchGetSteps();
      void dispatchGetHooks();
      void dispatchGetTestRunHooks();
      void dispatchGetParameterTypes();
      void dispatchGetDefaultTimeout();
      void dispatchTransform("num", ["1"]);
      void dispatchNewWorld({ greeting: "hi" });
      void dispatchStep("a step", [1]);
      void dispatchHook("before", 0, { pickle: { name: "S" } } as HookArg);
      void dispatchTestRunHook("beforeAll", 0, { greeting: "hi" });
    });

    expect(spy.mock.calls.map(([kind]) => kind)).toEqual([
      "getSteps",
      "getHooks",
      "getTestRunHooks",
      "getParameterTypes",
      "getDefaultTimeout",
      "transform",
      "newWorld",
      "step",
      "hook",
      "testRunHook",
    ]);
    // Spot-check the payloads carry the right shape.
    expect(spy.mock.calls.find(([k]) => k === "transform")?.[1]).toEqual({
      name: "num",
      groups: ["1"],
    });
    expect(spy.mock.calls.find(([k]) => k === "step")?.[1]).toEqual({
      pattern: "a step",
      args: [1],
    });
    expect(spy.mock.calls.find(([k]) => k === "hook")?.[1]).toEqual({
      kind: "before",
      index: 0,
      arg: { pickle: { name: "S" } },
    });
  });
});
