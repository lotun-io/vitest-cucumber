/**
 * Registers browser-defined steps AND hooks with the native Cucumber runtime.
 *
 * Loaded as Cucumber's support "import" inside the browser command. It reads the
 * step patterns and hooks the browser reported (via
 * `globalThis.__vitest_cucumber_browser__.support`) and registers proxies: native
 * Cucumber matches/parses/schedules in Node, and
 * each proxy bridges execution to the browser by key. The user's step files are
 * never imported here — only their patterns/hook metadata cross to Node — so
 * browser-only imports never evaluate in Node.
 *
 * Cucumber drives the lifecycle: a leading `Before` recreates the browser World
 * per scenario, then user hooks (with their tag expressions evaluated natively)
 * and steps run in the browser.
 */

import {
  After,
  AfterAll,
  AfterStep,
  Before,
  BeforeAll,
  BeforeStep,
  DataTable,
  defineParameterType,
  Given,
  setDefaultTimeout,
} from "@cucumber/cucumber";
import { globalRef } from "../utils/globals.ts";
import type { SerializedError } from "../utils/serializeError.ts";
import { serializeError } from "../utils/serializeError.ts";
import type {
  HookArg,
  HookInfo,
  HookOptions,
  ParameterTypeInfo,
  StepInfo,
  TestRunHooksInfo,
} from "./cucumberShim.ts";
import { DATA_TABLE_MARKER } from "./dataTable.ts";
import {
  dispatchHook,
  dispatchNewWorld,
  dispatchStep,
  dispatchTestRunHook,
  dispatchTransform,
  setCurrentNodeWorld,
} from "./taskBridge.ts";

export type BrowserSupport = {
  steps: StepInfo[];
  hooks: HookInfo[];
  testRunHooks: TestRunHooksInfo;
  parameterTypes: ParameterTypeInfo[];
  defaultTimeout?: number;
  testStepErrors: Map<string, SerializedError>;
};

const support = globalRef.__vitest_cucumber_browser__?.support;

if (!support) {
  throw new Error(
    "Browser support not found on globalThis.__vitest_cucumber_browser__.support",
  );
}

// Apply the browser's global default step/hook timeout (setDefaultTimeout) to
// the native runtime, which enforces it against each proxy.
if (support.defaultTimeout !== undefined) {
  setDefaultTimeout(support.defaultTimeout);
}

// Fresh browser World per scenario (registered first → runs before user hooks).
// `this` is Node's real World, so forward its `parameters` (the resolved
// worldParameters) to the browser so its World gets the same IWorldOptions.
Before(async function resetWorld(this: { parameters: unknown }) {
  await dispatchNewWorld(this.parameters);
});

// Capture each failed step's error (the revived, rich error sent back from the
// browser) so runCucumber can attach it to the Vitest result. Stored as a PLAIN
// object (not the raw Error) because the result is serialized again when it is
// streamed back to the browser as a `testCaseFinished` task.
AfterStep(function ({ testStepId, error }) {
  if (error) {
    support.testStepErrors.set(testStepId, serializeError(error));
  }
});

// A DataTable step argument is a class instance that can't survive the channel,
// so replace it with a serializable marker carrying its raw rows; the browser
// rebuilds the DataTable from it (DocStrings are plain strings — no conversion).
const toSerializableArg = (arg: unknown): unknown =>
  arg instanceof DataTable ? { [DATA_TABLE_MARKER]: arg.raw() } : arg;

const bridgeStep = (pattern: string, arity: number) => {
  const bridged = function bridged(this: unknown, ...args: unknown[]) {
    // Cucumber's user_code_runner ALWAYS appends an (error, result) callback to
    // the argument array, then picks the interface via
    // `callbackInterface = fn.length === argsArray.length`. `fn.length` is the
    // browser step's arity: for a callback-interface step it equals the
    // appended-args length, so Cucumber uses the callback — we must resolve that
    // callback from the dispatch (returning a promise too would be "multiple
    // asynchronous interfaces"). For a normal step the lengths differ, so we
    // strip the unused callback and return the dispatch promise.
    const usesCallback =
      args.length === arity && typeof args[args.length - 1] === "function";
    const callback =
      typeof args[args.length - 1] === "function"
        ? (args.pop() as (err: unknown, result?: unknown) => void)
        : undefined;
    // `this` is Node's real World — expose it so cucumberAttach can replay the
    // step's browser attachments in scope; cleared when the dispatch settles.
    setCurrentNodeWorld(this);
    const promise = dispatchStep(pattern, args.map(toSerializableArg)).finally(
      () => {
        setCurrentNodeWorld(undefined);
      },
    );
    if (usesCallback && callback) {
      promise.then(
        (result) => callback(null, result),
        (err) => callback(err),
      );
      return undefined;
    }
    return promise;
  };
  Object.defineProperty(bridged, "length", { value: arity });
  return bridged;
};

// Cucumber's native hook parameter ({ pickle, gherkinDocument, result, error,
// … }) is built on the Node side; serialize it (error → SerializedError) and
// forward it so the browser hook body receives it as its first argument.
const toHookArg = (arg: Record<string, unknown>): HookArg =>
  ({
    ...arg,
    error: arg.error ? serializeError(arg.error) : undefined,
  }) as HookArg;

// Revive a SerializedError sent back from the browser into a real Error so the
// Cucumber hook parameter's `error` matches what a Node hook would receive.
const reviveError = (error: SerializedError): Error =>
  Object.assign(new Error(error.message), error);

// Re-apply a browser hook body's in-place mutations onto Node's real hook
// parameter. `result` MUST be mutated in place (not reassigned): Cucumber holds
// this exact object in its stepResults array and re-reads its status after the
// hook runs, so a fresh object would not propagate (e.g. flipping a step to
// PASSED). `error` is informational, so reassigning it is enough.
const applyHookMutations = (
  arg: Record<string, unknown>,
  outcome: { hookResult?: unknown; hookError?: SerializedError },
) => {
  const { result } = arg;
  if (
    result &&
    typeof result === "object" &&
    outcome.hookResult &&
    typeof outcome.hookResult === "object"
  ) {
    for (const key of Object.keys(result)) {
      Reflect.deleteProperty(result, key);
    }
    Object.assign(result, outcome.hookResult);
  } else {
    arg.result = outcome.hookResult;
  }
  arg.error = outcome.hookError ? reviveError(outcome.hookError) : undefined;
};

const bridgeHook = (kind: HookInfo["kind"], index: number) =>
  async function bridgedHook(this: unknown, arg: unknown) {
    // `this` is Node's real World — expose it so attachments made in the hook
    // body are replayed in scope by cucumberAttach.
    setCurrentNodeWorld(this);
    try {
      const outcome = (await dispatchHook(
        kind,
        index,
        toHookArg(arg as Record<string, unknown>),
      )) as {
        value?: unknown;
        hookResult?: unknown;
        hookError?: SerializedError;
      };
      applyHookMutations(arg as Record<string, unknown>, outcome);
      return outcome.value;
    } finally {
      setCurrentNodeWorld(undefined);
    }
  };

const bridgeTestRunHook = (kind: "beforeAll" | "afterAll", index: number) =>
  async function bridgedTestRunHook(this: { parameters: unknown }) {
    // `this` is Cucumber's run context ({ parameters }); forward its parameters
    // so the browser's `context` export resolves to the same shape.
    return dispatchTestRunHook(kind, index, this.parameters);
  };

// Native registrar for each browser-defined hook kind. Cucumber matches tags
// and orders execution (Before/BeforeStep in order, After/AfterStep reversed);
// each proxy dispatches its body to the browser by (kind, index). The options
// (tag string or { tags, name, timeout }) are forwarded straight to native
// Cucumber, which evaluates them.
const registerHook: Record<
  HookInfo["kind"],
  (
    options: HookOptions | undefined,
    proxy: (arg: unknown) => Promise<unknown>,
  ) => void
> = {
  before: (options, proxy) => {
    if (options === undefined) {
      Before(proxy);
    } else if (typeof options === "string") {
      Before(options, proxy);
    } else {
      Before(options, proxy);
    }
  },
  after: (options, proxy) => {
    if (options === undefined) {
      After(proxy);
    } else if (typeof options === "string") {
      After(options, proxy);
    } else {
      After(options, proxy);
    }
  },
  beforeStep: (options, proxy) => {
    if (options === undefined) {
      BeforeStep(proxy);
    } else if (typeof options === "string") {
      BeforeStep(options, proxy);
    } else {
      BeforeStep(options, proxy);
    }
  },
  afterStep: (options, proxy) => {
    if (options === undefined) {
      AfterStep(proxy);
    } else if (typeof options === "string") {
      AfterStep(options, proxy);
    } else {
      AfterStep(options, proxy);
    }
  },
};

for (const hook of support.hooks ?? []) {
  registerHook[hook.kind](hook.options, bridgeHook(hook.kind, hook.index));
}

// Register custom parameter types BEFORE the steps (their cucumber expressions
// reference them). Each transformer round-trips to the browser, which runs the
// real one (World as `this`) and returns a token resolved back to the value.
for (const pt of support.parameterTypes ?? []) {
  defineParameterType({
    name: pt.name,
    regexp: Array.isArray(pt.regexp)
      ? pt.regexp.map((source) => new RegExp(source))
      : new RegExp(pt.regexp),
    preferForRegexpMatch: pt.preferForRegexpMatch,
    useForSnippets: pt.useForSnippets,
    transformer: (...groups: string[]) => dispatchTransform(pt.name, groups),
  });
}

for (const { pattern, arity, options, regexp } of support.steps ?? []) {
  const proxy = bridgeStep(pattern, arity);
  // A RegExp-defined step is registered with a real RegExp matcher; the proxy
  // still dispatches by the string key, so the browser looks it up unchanged.
  const matcher = regexp ? new RegExp(regexp.source, regexp.flags) : pattern;
  if (options) {
    Given(matcher, options, proxy);
  } else {
    Given(matcher, proxy);
  }
}

// Register one native BeforeAll/AfterAll proxy per browser-defined test-run
// hook; each dispatches its body to the browser when Cucumber runs it.
(support.testRunHooks.beforeAll ?? []).forEach((options, index) => {
  const proxy = bridgeTestRunHook("beforeAll", index);
  if (options) {
    BeforeAll(options, proxy);
  } else {
    BeforeAll(proxy);
  }
});
(support.testRunHooks.afterAll ?? []).forEach((options, index) => {
  const proxy = bridgeTestRunHook("afterAll", index);
  if (options) {
    AfterAll(options, proxy);
  } else {
    AfterAll(proxy);
  }
});
