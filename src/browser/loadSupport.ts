// Registers browser-defined steps/hooks/param-types with the native Cucumber
// runtime as Node proxies. Step files never load in Node.
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
  BrowserAttachment,
  HookArg,
  HookInfo,
  HookOptions,
  ParameterTypeInfo,
  StepInfo,
  TestRunHooksInfo,
} from "./cucumberShim.ts";
import {
  dispatchHook,
  dispatchNewWorld,
  dispatchStep,
  dispatchTestRunHook,
  dispatchTransform,
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

// Apply the browser's default timeout to the native runtime.
if (support.defaultTimeout !== undefined) {
  setDefaultTimeout(support.defaultTimeout);
}

// Fresh World per scenario; `this.parameters` comes from Node's real World.
Before(async function resetWorld(this: { parameters: unknown }) {
  await dispatchNewWorld(this.parameters);
});

// Capture failed step errors so runCucumber can attach them to the Vitest result.
AfterStep(function ({ testStepId, error }) {
  if (error) {
    support.testStepErrors.set(testStepId, serializeError(error));
  }
});

// DataTable can't survive the channel; replace with a wire marker (DocStrings are plain strings).
const toSerializableArg = (arg: unknown): unknown =>
  arg instanceof DataTable ? { __vc: "dataTable", rows: arg.raw() } : arg;

// Replays body attachments via the real Node World so envelopes land in scope.
const replayBodyAttachments = (world: unknown, result: unknown): unknown => {
  const { value, attachments } = (result ?? {}) as {
    value?: unknown;
    attachments?: BrowserAttachment[];
  };
  const attach = (world as { attach?: (d: unknown, m?: unknown) => void })
    ?.attach;
  for (const attachment of attachments ?? []) {
    attach?.(attachment.data, attachment.mediaTypeOrOptions);
  }
  return value;
};

const bridgeStep = (pattern: string, arity: number) => {
  const bridged = function bridged(this: unknown, ...args: unknown[]) {
    // Cucumber appends a callback when fn.length === argsArray.length; detect
    // this from the browser step's arity and use the matching interface.
    // For normal steps strip the unused callback and return the dispatch promise.
    const usesCallback =
      args.length === arity && typeof args[args.length - 1] === "function";
    const callback =
      typeof args[args.length - 1] === "function"
        ? (args.pop() as (err: unknown, result?: unknown) => void)
        : undefined;
    // `this` is Node's real World — replay any attachments the browser body
    // produced via the real `this.attach` while this step is still in scope.
    const promise = dispatchStep(pattern, args.map(toSerializableArg));
    if (usesCallback && callback) {
      promise.then(
        (result) => callback(null, replayBodyAttachments(this, result)),
        (err) => callback(err),
      );
      return undefined;
    }
    return promise.then((result) => replayBodyAttachments(this, result));
  };
  Object.defineProperty(bridged, "length", { value: arity });
  return bridged;
};

// Serialize the hook parameter (error → SerializedError) to forward to the browser.
const toHookArg = (arg: Record<string, unknown>): HookArg =>
  ({
    ...arg,
    error: arg.error ? serializeError(arg.error) : undefined,
  }) as HookArg;

const reviveError = (error: SerializedError): Error =>
  Object.assign(new Error(error.message), error);

// Re-apply in-place mutations the browser hook body made to the hook parameter.
// `result` MUST be mutated in place: Cucumber re-reads this exact object after
// the hook runs.
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
    const outcome = (await dispatchHook(
      kind,
      index,
      toHookArg(arg as Record<string, unknown>),
    )) as {
      value?: unknown;
      hookResult?: unknown;
      hookError?: SerializedError;
      attachments?: BrowserAttachment[];
    };
    applyHookMutations(arg as Record<string, unknown>, outcome);
    // `this` is Node's real World — replay any attachments the hook body made.
    return replayBodyAttachments(this, {
      value: outcome.value,
      attachments: outcome.attachments,
    });
  };

const bridgeTestRunHook = (kind: "beforeAll" | "afterAll", index: number) =>
  async function bridgedTestRunHook(this: { parameters: unknown }) {
  // `this` is Cucumber's run context; forward parameters so the `context` export resolves.
  return dispatchTestRunHook(kind, index, this.parameters);
  };

// One lookup replaces the 4×3-arm registrar map. Cucumber evaluates tag
// expressions and ordering; each proxy dispatches its body to the browser.
// Cast bypasses TypeScript's overloads — runtime behaviour is identical.
type RegisterHook = (
  optOrFn: HookOptions | ((this: unknown, arg: unknown) => unknown),
  fn?: (this: unknown, arg: unknown) => unknown,
) => void;
const registerHook: Record<HookInfo["kind"], RegisterHook> = {
  before: Before as RegisterHook,
  after: After as RegisterHook,
  beforeStep: BeforeStep as RegisterHook,
  afterStep: AfterStep as RegisterHook,
};

for (const { kind, index, options } of support.hooks ?? []) {
  const proxy = bridgeHook(kind, index);
  if (options === undefined) {
    registerHook[kind](proxy);
  } else {
    registerHook[kind](options, proxy);
  }
}

// Register parameter types before steps (cucumber expressions reference them).
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
  // RegExp-defined steps use a real RegExp matcher; proxy dispatches by string key.
  const matcher = regexp ? new RegExp(regexp.source, regexp.flags) : pattern;
  if (options) {
    Given(matcher, options, proxy);
  } else {
    Given(matcher, proxy);
  }
}

// Register one native BeforeAll/AfterAll proxy per browser-defined test-run
// hook; each dispatches its body to the browser when Cucumber runs it.
type RegisterTestRunHook = (
  optOrFn: { timeout?: number } | (() => unknown),
  fn?: () => unknown,
) => void;
const registerTestRunHook: Record<
  "beforeAll" | "afterAll",
  RegisterTestRunHook
> = {
  beforeAll: BeforeAll as RegisterTestRunHook,
  afterAll: AfterAll as RegisterTestRunHook,
};

for (const kind of ["beforeAll", "afterAll"] as const) {
  (support.testRunHooks[kind] ?? []).forEach((options, index) => {
    const proxy = bridgeTestRunHook(kind, index);
    if (options) {
      registerTestRunHook[kind](options, proxy);
    } else {
      registerTestRunHook[kind](proxy);
    }
  });
}
