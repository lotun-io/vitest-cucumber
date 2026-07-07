import { globalRef } from "../utils/globals.ts";
import type { SerializedError } from "../utils/serializeError.ts";
import { serializeError } from "../utils/serializeError.ts";
import { decodeAll, hold } from "./wire.ts";

// Re-export so step files' `import { DataTable } from "@cucumber/cucumber"`
// (resolved to this shim in the browser) gets the browser-side class.
export { DataTable } from "./dataTable.ts";
export { Status } from "./status.ts";

// The native runtime's `version`. Set on Node (where the package is installed)
// and injected by the runner; live-bound so `import { version }` reflects it.
export let version = "";
export const setVersion = (value: string): void => {
  version = value;
};

type StepFn = (this: unknown, ...args: unknown[]) => unknown;

// Serializable definition options forwarded verbatim to native Cucumber on Node.
export type StepOptions = { timeout?: number; wrapperOptions?: unknown };
export type HookOptions =
  string | { tags?: string; name?: string; timeout?: number };
export type TestRunHookOptions = { timeout?: number };

interface StepEntry {
  fn: StepFn;
  options?: StepOptions;
  // Set when the step was defined with a RegExp; carried to Node so it registers
  // a real RegExp matcher (String(regexp) would be parsed as a Cucumber Expression).
  regexp?: { source: string; flags: string };
}

interface HookEntry {
  options?: HookOptions;
  fn: StepFn;
}

interface TestRunHookEntry {
  fn: StepFn;
  options?: TestRunHookOptions;
}

type TransformerFn = (this: unknown, ...groups: string[]) => unknown;

// A step/hook wrapper (setDefinitionFunctionWrapper): given the user body (and a
// step's wrapperOptions), it returns the function Cucumber actually invokes.
type DefinitionFunctionWrapper = (fn: StepFn, options?: unknown) => StepFn;

interface ParameterTypeEntry {
  name: string;
  regexp: string | string[];
  transformer: TransformerFn;
  useForSnippets?: boolean;
  preferForRegexpMatch?: boolean;
}

export interface BrowserRegistry {
  steps: Record<string, StepEntry>;
  before: HookEntry[];
  after: HookEntry[];
  beforeStep: HookEntry[];
  afterStep: HookEntry[];
  beforeAll: TestRunHookEntry[];
  afterAll: TestRunHookEntry[];
  parameterTypes: ParameterTypeEntry[];
  WorldCtor: new (options: IWorldOptions) => unknown;
  world: unknown;
  parameters: unknown;
  defaultTimeout?: number;
  definitionFunctionWrapper?: DefinitionFunctionWrapper;
}

export type HookKind = "before" | "after" | "beforeStep" | "afterStep";

// Serialized metadata the browser reports so Node can register native proxies.
export type StepInfo = {
  pattern: string;
  arity: number;
  options?: StepOptions;
  regexp?: { source: string; flags: string };
};
export type HookInfo = { kind: HookKind; index: number; options?: HookOptions };
export type TestRunHooksInfo = {
  beforeAll: (TestRunHookOptions | undefined)[];
  afterAll: (TestRunHookOptions | undefined)[];
};

// Serializable parameter-type metadata (regexp as source string(s)); Node
// registers it natively and round-trips each transform back to the browser.
export type ParameterTypeInfo = {
  name: string;
  regexp: string | string[];
  useForSnippets?: boolean;
  preferForRegexpMatch?: boolean;
};

// The (serializable) hook parameter Cucumber passes to a Before/After/BeforeStep/
// AfterStep body. Mirrors ITestCaseHookParameter/ITestStepHookParameter, except
// `error` is our SerializedError form so it survives the channel.
export type HookArg = {
  gherkinDocument?: unknown;
  pickle?: unknown;
  pickleStep?: unknown;
  result?: unknown;
  error?: SerializedError;
  willBeRetried?: boolean;
  testCaseStartedId?: string;
  testStepId?: string;
};

export type BodyResult = {
  value?: unknown;
  err?: SerializedError;
  attachments?: BrowserAttachment[];
  // The hook parameter's `result`/`error` after the body ran, sent back so Node
  // can re-apply a hook's in-place mutations (e.g. flipping a step's status, or
  // clearing/replacing the error) onto the real Cucumber hook parameter.
  hookResult?: unknown;
  hookError?: SerializedError;
};

// A normalized attachment produced by World.attach/log/link, flushed with the
// body so Node can replay it via the real `this.attach` inside the step scope.
export type BrowserAttachment = {
  data: string;
  mediaTypeOrOptions?: string | { mediaType?: string; fileName?: string };
};

// The invocation API the Node-side pull-loop calls to drive execution in the
// page (the registered definitions + World live in BrowserRegistry).
export type BrowserBridge = {
  newWorld: (parameters: unknown) => void;
  // Node asks for the full browser registry in one call so it can register
  // matching proxies with the native runtime — step files never load in Node,
  // so their browser-only imports never run there.
  getRegistry: () => {
    steps: StepInfo[];
    hooks: HookInfo[];
    testRunHooks: TestRunHooksInfo;
    parameterTypes: ParameterTypeInfo[];
    defaultTimeout?: number;
  };
  runStep: (pattern: string, args: unknown[]) => Promise<BodyResult>;
  runHook: (kind: HookKind, index: number, arg: HookArg) => Promise<BodyResult>;
  runTransform: (name: string, groups: string[]) => Promise<BodyResult>;
  runTestRunHook: (
    kind: "beforeAll" | "afterAll",
    index: number,
    parameters: unknown,
  ) => Promise<BodyResult>;
};

// Runs a body and ALWAYS resolves to a result/error object — it never rejects,
// so a failing step/hook body can't surface as an unhandled rejection in the
// page (Vitest's browser instrumentation flags a rejected promise the instant
// it rejects, even if it's awaited a tick later).
const runBody = async (fn: () => unknown): Promise<BodyResult> => {
  try {
    return { value: await fn() };
  } catch (err) {
    return { err: serializeError(err) };
  }
};

// Cucumber's World options (IWorldOptions). `attach`/`log`/`link` report
// attachments & logs (synchronous void side-effects); `parameters` carries the
// configured worldParameters. The browser fills attach/log/link with bridged
// implementations when constructing the World.
type AttachMediaType = string | { mediaType?: string; fileName?: string };
type AttachFn = (
  data: string,
  mediaTypeOrOptions?: AttachMediaType,
  callback?: (error?: unknown) => void,
) => void;
type LogFn = (text: string) => void;
type LinkFn = (...urls: string[]) => void;

export interface IWorldOptions {
  attach: AttachFn;
  log: LogFn;
  link: LinkFn;
  parameters: unknown;
}

// Cucumber's default World (used when setWorldConstructor isn't called) — a
// verbatim port of @cucumber/cucumber's base World: it just stores the options.
export class World {
  attach: AttachFn;
  log: LogFn;
  link: LinkFn;
  parameters: unknown;
  constructor({ attach, log, link, parameters }: IWorldOptions) {
    this.attach = attach;
    this.log = log;
    this.link = link;
    this.parameters = parameters;
  }
}

// Buffered during a body; runStep/runHook flush them onto the BodyResult.
let attachmentBuffer: BrowserAttachment[] = [];

// attach buffers data verbatim (IDENTITY or base64 for binary like screenshots).
const attach: AttachFn = (data, mediaTypeOrOptions) => {
  attachmentBuffer.push({ data, mediaTypeOrOptions });
};
const log: LogFn = (text) => {
  attach(text, "text/x.cucumber.log+plain");
};
const link: LinkFn = (...urls) => {
  attach(urls.join("\n"), "text/uri-list");
};

// Runs a body, capturing any attachments it produced onto the result so Node can
// replay them within the step/hook scope (bodies run sequentially in the page).
const runBodyWithAttachments = async (
  fn: () => unknown,
): Promise<BodyResult> => {
  const buffer: BrowserAttachment[] = [];
  attachmentBuffer = buffer;
  const result = await runBody(fn);
  if (buffer.length > 0) {
    result.attachments = buffer;
  }
  return result;
};

const browser = (globalRef.__vitest_cucumber_browser__ ??= {});

const registry: BrowserRegistry = (browser.registry ??= {
  steps: {},
  before: [],
  after: [],
  beforeStep: [],
  afterStep: [],
  beforeAll: [],
  afterAll: [],
  parameterTypes: [],
  WorldCtor: World,
  world: null,
  parameters: undefined,
});

const define = (
  pattern: string | RegExp,
  optionsOrFn: StepOptions | StepFn,
  maybeFn?: StepFn,
): void => {
  const fn = (maybeFn ?? optionsOrFn) as StepFn;
  const options = maybeFn ? (optionsOrFn as StepOptions) : undefined;
  registry.steps[String(pattern)] = {
    fn,
    options,
    regexp:
      pattern instanceof RegExp
        ? { source: pattern.source, flags: pattern.flags }
        : undefined,
  };
};

// Hook args: (fn) | (tags, fn) | (options, fn) — body is always the last arg.
const defineHook =
  (list: HookEntry[]) =>
  (...args: unknown[]): void => {
    const fn = args.pop() as StepFn;
    list.push({ options: args[0] as HookOptions | undefined, fn });
  };

const defineTestRunHook =
  (list: TestRunHookEntry[]) =>
  (...args: unknown[]): void => {
    const fn = args.pop() as StepFn;
    list.push({ options: args[0] as TestRunHookOptions | undefined, fn });
  };

export const Given = define;
export const When = define;
export const Then = define;
export const defineStep = define;
export const Before = defineHook(registry.before);
export const After = defineHook(registry.after);
export const BeforeStep = defineHook(registry.beforeStep);
export const AfterStep = defineHook(registry.afterStep);
export const BeforeAll = defineTestRunHook(registry.beforeAll);
export const AfterAll = defineTestRunHook(registry.afterAll);
export const setWorldConstructor = (
  ctor: new (options: IWorldOptions) => unknown,
): void => {
  registry.WorldCtor = ctor;
};
export const setDefaultTimeout = (ms: number): void => {
  registry.defaultTimeout = ms;
};
export const setDefinitionFunctionWrapper = (
  wrapper: DefinitionFunctionWrapper,
): void => {
  registry.definitionFunctionWrapper = wrapper;
};
// No-op: parallel execution is forbidden (mergeConfig throws on `parallel`), so
// the serial runtime never invokes a parallelCanAssign validator — same as node.
export const setParallelCanAssign = (): void => {};

// `world` (v10.8+): Proxy forwarding every Reflect trap to the active World.
// Allows arrow-function steps to access World state without `this`.
const NO_WORLD = Symbol("vitest-cucumber:no-world");
let activeWorld: unknown = NO_WORLD;

const requireWorld = (): object => {
  if (activeWorld === NO_WORLD || activeWorld == null) {
    throw new Error("Cannot use `world` outside of a step or hook");
  }
  return activeWorld as object;
};

// Binds `activeWorld` for the body's duration; save/restore handles nesting.
const bindWorld = async (
  nextWorld: unknown,
  fn: () => unknown,
): Promise<unknown> => {
  const previous = activeWorld;
  activeWorld = nextWorld;
  try {
    return await fn();
  } finally {
    activeWorld = previous;
  }
};

const reflect = Reflect as Record<
  PropertyKey,
  (target: object, ...args: unknown[]) => unknown
>;

export const world = new Proxy<Record<string, unknown>>(
  {},
  Object.fromEntries(
    Object.getOwnPropertyNames(reflect).map(
      (trap): [string, (target: object, ...args: unknown[]) => unknown] => [
        trap,
        (_target, ...args) => reflect[trap](requireWorld(), ...args),
      ],
    ),
  ),
);

// `context` (v11+): run-scoped Proxy, available only in BeforeAll/AfterAll.
const NO_CONTEXT = Symbol("vitest-cucumber:no-context");
let activeContext: unknown = NO_CONTEXT;

const requireContext = (): object => {
  if (activeContext === NO_CONTEXT || activeContext == null) {
    throw new Error(
      "Cannot use `context` outside of a BeforeAll or AfterAll hook",
    );
  }
  return activeContext as object;
};

// Binds `activeContext` for the body's duration.
const bindContext = async (
  nextContext: unknown,
  fn: () => unknown,
): Promise<unknown> => {
  const previous = activeContext;
  activeContext = nextContext;
  try {
    return await fn();
  } finally {
    activeContext = previous;
  }
};

export const context = new Proxy<Record<string, unknown>>(
  {},
  Object.fromEntries(
    Object.getOwnPropertyNames(reflect).map(
      (trap): [string, (target: object, ...args: unknown[]) => unknown] => [
        trap,
        (_target, ...args) => reflect[trap](requireContext(), ...args),
      ],
    ),
  ),
);

// Reduces regexp to source string(s) for cross-realm serialization.
const toRegexpSource = (
  regexp: RegExp | string | readonly (RegExp | string)[],
): string | string[] =>
  Array.isArray(regexp)
    ? regexp.map((one) => (one instanceof RegExp ? one.source : one))
    : regexp instanceof RegExp
      ? regexp.source
      : (regexp as string);

export const defineParameterType = (options: {
  name: string;
  regexp: RegExp | string | readonly (RegExp | string)[];
  transformer?: TransformerFn;
  useForSnippets?: boolean;
  preferForRegexpMatch?: boolean;
}): void => {
  registry.parameterTypes.push({
    name: options.name,
    regexp: toRegexpSource(options.regexp),
    transformer: options.transformer ?? ((group: string) => group),
    useForSnippets: options.useForSnippets,
    preferForRegexpMatch: options.preferForRegexpMatch,
  });
};

// Ported from @cucumber/cucumber src/time.ts; uses page timers (no fake-timer indirection).
export async function wrapPromiseWithTimeout<T>(
  promise: Promise<T>,
  timeoutInMilliseconds: number,
  timeoutMessage = "",
): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout>;
  const message =
    timeoutMessage === ""
      ? `Action did not complete within ${timeoutInMilliseconds} milliseconds`
      : timeoutMessage;
  const timeoutPromise = new Promise<T>((_resolve, reject) => {
    timeoutId = setTimeout(() => {
      reject(new Error(message));
    }, timeoutInMilliseconds);
  });
  return await Promise.race([promise, timeoutPromise]).finally(() => {
    clearTimeout(timeoutId);
  });
}

// Invoked by the browser pull-loop.
const hookList = (kind: HookKind): HookEntry[] => {
  switch (kind) {
    case "before":
      return registry.before;
    case "after":
      return registry.after;
    case "beforeStep":
      return registry.beforeStep;
    case "afterStep":
      return registry.afterStep;
  }
};

// Runs a body honouring Cucumber's callback interface. `setDefinitionFunctionWrapper`
// wraps the body first; callback detection uses the ORIGINAL arity.
const invoke = (
  fn: StepFn,
  thisArg: unknown,
  args: unknown[],
  wrapperOptions?: unknown,
): unknown => {
  const arity = fn.length;
  const body = registry.definitionFunctionWrapper
    ? registry.definitionFunctionWrapper(fn, wrapperOptions)
    : fn;
  return arity > args.length
    ? new Promise((resolve, reject) => {
        body.apply(thisArg, [
          ...args,
          (err: unknown, res?: unknown) => (err ? reject(err) : resolve(res)),
        ]);
      })
    : body.apply(thisArg, args);
};

// Parameter-type transforms run in the page (where the World + transformer live)
// but the value must reach Node and come back as the step arg. To keep it intact
// (including non-serializable instances), the value is held in the page and only
// a handle marker crosses the channel; runStep redeems it via the wire codec.
const resolveHandles = decodeAll;

browser.bridge = {
  // Construct a fresh World for the next scenario, seeded with Cucumber's
  // IWorldOptions: parameters come from Node; attach/log/link buffer attachments
  // (flushed onto the body result and replayed on Node within the step scope).
  newWorld: (parameters) => {
    registry.parameters = parameters;
    registry.world = new registry.WorldCtor({ attach, log, link, parameters });
  },
  // Collect the full browser registry in one shot: Node asks once at support-
  // build time and registers matching proxies (step files never load in Node).
  getRegistry: () => ({
    steps: Object.entries(registry.steps).map(
      ([pattern, { fn, options, regexp }]) => ({
        pattern,
        arity: fn.length,
        options,
        regexp,
      }),
    ),
    hooks: (["before", "after", "beforeStep", "afterStep"] as const).flatMap(
      (kind) =>
        hookList(kind).map((hook, index) => ({
          kind,
          index,
          options: hook.options,
        })),
    ),
    testRunHooks: {
      beforeAll: registry.beforeAll.map((hook) => hook.options),
      afterAll: registry.afterAll.map((hook) => hook.options),
    },
    // Custom parameter types (defineParameterType); Node registers them with
    // the regexp and round-trips each transform back here via runTransform.
    parameterTypes: registry.parameterTypes.map(
      ({ name, regexp, useForSnippets, preferForRegexpMatch }) => ({
        name,
        regexp,
        useForSnippets,
        preferForRegexpMatch,
      }),
    ),
    // The global default timeout (setDefaultTimeout); Node applies it via
    // native Cucumber's setDefaultTimeout when loading support.
    defaultTimeout: registry.defaultTimeout,
  }),
  // Run a parameter type's transformer (World as `this`) and return a token the
  // step later resolves back to the real value (see resolveHandles).
  runTransform: (name, groups) =>
    runBody(() =>
      bindWorld(registry.world, async () => {
        const pt = registry.parameterTypes.find((p) => p.name === name);
        if (!pt) {
          throw new Error(`No parameter type registered for: ${name}`);
        }
        const value = await pt.transformer.apply(registry.world, groups);
        return hold(value);
      }),
    ),
  runStep: (pattern, args) =>
    runBodyWithAttachments(() =>
      bindWorld(registry.world, () => {
        const entry = registry.steps[pattern];
        if (!entry) {
          throw new Error(
            `No browser step definition registered for: ${pattern}`,
          );
        }
        return invoke(
          entry.fn,
          registry.world,
          resolveHandles(args),
          entry.options?.wrapperOptions,
        );
      }),
    ),
  runHook: async (kind, index, arg) => {
    const result = await runBodyWithAttachments(() =>
      bindWorld(registry.world, () =>
        invoke(hookList(kind)[index].fn, registry.world, [arg]),
      ),
    );
    // Capture any in-place mutations the body made to the hook parameter so Node
    // can re-apply them. Always serialize the error: the body may have replaced
    // it with a fresh raw Error (the inbound value is already a SerializedError).
    result.hookResult = arg.result;
    result.hookError = arg.error ? serializeError(arg.error) : undefined;
    return result;
  },
  runTestRunHook: (kind, index, parameters) =>
    runBody(() => {
      // Cucumber seeds each run-level hook with a fresh `{ parameters }` context
      // (also the hook's `this`); bind it so the `context` export resolves.
      const ctx = { parameters };
      return bindContext(ctx, () =>
        invoke(
          (kind === "beforeAll" ? registry.beforeAll : registry.afterAll)[index]
            .fn,
          ctx,
          [],
        ),
      );
    }),
};
