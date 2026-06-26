# @lotun/vitest-cucumber — Project Guidelines

## Overview

A Vitest plugin that runs Gherkin `.feature` files as native Vitest tests using the official `@cucumber/cucumber` runtime. The plugin intercepts `.feature` files during Vite's `transform` phase and replaces them with JS that calls `runFeatureFile()`.

## Architecture

```
src/
├── index.ts              — re-exports plugin.ts (public API)
├── plugin.ts             — Vite/Vitest Plugin; transforms .feature → JS
├── features/
│   └── lifecycle.feature — empty feature (no scenarios) used to drive AfterAll hooks
├── types/global.ts       — global augmentation for __vitestCucumber bridge object
└── utils/
    ├── runner.ts         — runFeatureFile(): per-feature orchestrator, module-scoped support cache, BeforeAll/AfterAll lifecycle
    ├── runCucumber.ts    — Cucumber runtime invocation; emits results map; supportWithHook() strips test-run hooks
    ├── registerFeatureTests.ts — registers results as Vitest describe/test blocks
    ├── loadSupport.ts    — globs & imports step definitions/hooks via Vitest's moduleLoader
    ├── config.ts         — parses CUCUMBER_OPTIONS env var using Cucumber's ArgvParser
    ├── createError.ts    — maps Cucumber failures to Vitest-friendly Error with clickable .stack
    └── silentFormatter.ts — no-op Cucumber formatter (suppresses CLI output)
```

`src/features/lifecycle.feature` is copied to `dist/features/lifecycle.feature` at build time via tsdown's `copy: [{ from: "src/features/lifecycle.feature", to: "dist/features" }]`. `runner.ts` resolves it with `path.join(import.meta.dirname, "..", "features", "lifecycle.feature")`, which lands on `src/features/` in dev and `dist/features/` when published.

## Build & Test

```bash
pnpm build          # tsdown — outputs ESM to dist/, unbundled, with .d.mts types
pnpm test           # vitest run --coverage (two projects: unit + functional)
pnpm lint           # tsc + prettier check + eslint
pnpm format         # prettier write + eslint --fix
```

- **Unit tests**: `src/**/__tests__/**/*.test.ts`
- **Functional tests**: `features/**/*.feature` (run through the plugin itself)
- Coverage thresholds: statements 90%, branches 80%, functions 90%, lines 90%

## Key Conventions

### Collection-phase test registration

`plugin.ts` transforms each `.feature` file into JS with a top-level `await runFeatureFile(...)`. This runs during Vitest's **collection phase** (module evaluation), before any tests execute. Inside `runFeatureFile`, `runCucumber` is called and its promise stored as `runCucumberPromise` — not awaited. `void runCucumberPromise.catch(() => null)` is attached **immediately** to suppress the unhandled-rejection warning that would otherwise fire before `afterAll` runs. `runCucumber` emits an `onTestCasesReady` callback when the first `testCaseStarted` envelope arrives. That callback calls `registerFeatureTests`, which calls `describe`/`test` — valid because we're still in the collection phase. `runFeatureFile` then `await`s a `testCasesReady` promise that is resolved inside `onTestCasesReady`, unblocking the top-level await and completing collection. An `afterAll` registered after the await awaits `runCucumberPromise` to propagate any Cucumber runtime error.

```
plugin.ts transform → top-level await runFeatureFile()
  runFeatureFile()
    → runCucumberPromise = runCucumber()  (not awaited)
    → void runCucumberPromise.catch(() => null)  (suppress unhandled-rejection)
        → testCase envelopes: build results map (shuffled/filtered order)
        → first testCaseStarted: onTestCasesReady → registerFeatureTests() → describe/test
                                                   → testCasesReady.resolve()
    → await testCasesReady.promise  ← unblocks here, collection complete
    → afterAll(await runCucumberPromise)
  Cucumber continues running scenarios, resolving resolvers as testCaseFinished arrives
  Each test() awaits result.resolvers.promise
```

### Real-time streaming

Each scenario is registered as a `test` with timeout `0`. Tests run sequentially in registration order. Each test `await`s `result.resolvers.promise` — a `PromiseWithResolvers` created in the `testCase` handler inside `runCucumber`. The `testCaseFinished` envelope handler resolves the promise for that scenario. Tag-filtered scenarios (which never fire `testCaseFinished`) are resolved by the `notifyReady?.()` fallback call after `cucumberApi.runCucumber` completes, so tests don't hang.

### Execution order

`testCase` envelopes arrive in Cucumber's actual execution order — this includes `order: random` with a seed. `results` is a `Map` whose insertion order matches Cucumber's execution order. `registerFeatureTests` iterates `results.values()` directly, preserving that order. Scenarios belonging to the same `Rule` are grouped into consecutive `describe` blocks: consecutive entries with the same rule name share one `describe`; if the same rule appears non-consecutively (possible with `order: random`), it gets separate `describe` blocks.

### `notifyReady` pattern

`notifyReady` is a self-nulling closure defined at the top of `runCucumber`:

```ts
let notifyReady: (() => void) | undefined = () => {
  onTestCasesReady?.({ id, featureName, results });
  notifyReady = undefined;
};
```

Called at `testCaseStarted` (normal path) and with `?.` after the full run as a fallback for parse errors or empty features. Setting itself to `undefined` after the first call makes it safe to call multiple times with `notifyReady?.()`.

### Empty-results / parse-error path

When `results.size === 0` (parse error, all scenarios tag-filtered, or empty feature), `registerFeatureTests` registers a **runtime-skip** test instead of a static `test.skip`:

```ts
test(featureName, (ctx) => {
  ctx.skip();
});
```

A static `test.skip` would cause Vitest to skip the entire suite — including `afterAll` — swallowing the parse error silently. A runtime `ctx.skip()` means Vitest executes the test body (completing the suite), so `afterAll` still fires and `await runCucumberPromise` throws the parse/hook error.

### `pickleById` local map

`envelope.pickle` arrives before `envelope.testCase`. A local `Map<string, Pickle>` is populated in the `pickle` handler for O(1) lookup in the `testCase` handler — avoids `query.findAllPickles().find()`.

### ResultItem shape

`ResultItem` embeds `resolvers: PromiseWithResolvers<unknown>` alongside `name`, `lineage`, and status/step/error fields. Entries are allocated in `runCucumber`'s `testCase` handler — one per `testCase` envelope, keyed by `pickle.id` (UUID). `name` and `lineage` are stored directly on `ResultItem` at allocation time. The `testStepFinished` handler mutates status/step/error in-place. `testCaseFinished` resolves the promise. Fields are reset to `undefined` on `testCaseStarted` to handle retries.

### Support code loading

`loadSupport.ts` is loaded as a fake Cucumber "import" path so it runs inside the Cucumber bootstrap, but all user step files are imported via `moduleLoader` (Vitest's `import(specifier)`). This ensures coverage instrumentation and module mocking apply to step definitions.

An `AfterStep` hook in `loadSupport.ts` captures the raw `Error` object per `testStepId` into the `testStepErrors` map. `AfterStep` fires inside `runStepFn()` before the `testStepFinished` envelope is emitted, so the map is always populated when the envelope handler reads it.

### Worker-level cache

`cache` in `runner.ts` is module-scoped. When `isolate: false`, the same worker reuses cached `runConfiguration` and `ISupportCodeLibrary` across feature files. Clear `testStepErrors` (not the whole cache) between runs. The `mergedConfig` computation (including `cliConfig()`) is done once inside the `if (!cache)` block.

### BeforeAll / AfterAll lifecycle hooks

Cucumber runs its full lifecycle (`BeforeAll → scenarios → AfterAll`) on **every** `runCucumber` call. Left unchecked, that fires `BeforeAll`/`AfterAll` once per `.feature` file instead of once per run. The plugin controls this with the required `withHook: "before" | "after" | "none"` param (type `WithHook`) on `runCucumber`, which calls `supportWithHook({ support, withHook })` to shallow-clone the support library with `beforeTestRunHookDefinitions` / `afterTestRunHookDefinitions` selectively emptied. (Those arrays are on the concrete library but not the public `ISupportCodeLibrary` type, so the helper narrows via a local `TestRunHookDefinitions` cast.)

- **BeforeAll** runs inline with the worker's first feature: `isCacheReused = Boolean(cache)` is captured at entry, so the first feature (fresh cache) uses `withHook: "before"` and every later feature uses `"none"`.
- **AfterAll** runs once when the worker is torn down. Inside the `if (!cache)` block, `onWorkerCleanup` registers a callback via `globalThis.__vitest_worker__?.onCleanup` (a private Vitest API, optional-chained — silently no-ops, skipping AfterAll, if unavailable). The callback runs `runCucumber` against the empty `lifecycle.feature` with `withHook: "after"`.

`onCleanup` fires once per worker on the `"stop"` message — Vitest's `cleanupListeners` Set is never cleared, so registering inside `if (!cache)` (once per realm) avoids duplicate AfterAll runs.

Frequency is **self-adjusting** with the user's `isolate` setting (the plugin never forces it):

- `isolate: false` — worker realm and cache persist across files → BeforeAll once on the first feature, AfterAll once at worker stop.
- `isolate: true` — realm recreated per file → BeforeAll and AfterAll fire per feature (the only coherent behaviour when each feature is a sealed realm).

A failing `BeforeAll` rejects the first feature's `runCucumberPromise` and surfaces via its `afterAll`. A failing `AfterAll` throws inside the `onCleanup` callback and surfaces as a Vitest **Teardown Error** (non-zero exit), not a test failure.

### Error attribution

`createError.ts` builds a synthetic `.stack` pointing at the failing line in the `.feature` file — this is what makes errors clickable in VS Code.

`err.stack` is built as `[cucumberError, ...frames].join("\n")` — no trailing newline when `frames` is empty (e.g. hook errors with no scenario location). `cucumberError` falls back to `result.status ?? "FAILED"` when `stepResult.message` is absent.

Frames emitted (each only when the relevant location is present):

- `    at Scenario (${id}:${line}:${col})`
- `    at Example (${id}:${line}:${col})` — outline examples only
- `    at Step (${id}:${line}:${col})`

When a diff should be shown, `err.message` is replaced with the bare assertion sentence so Vitest does not render the diff twice. The condition mirrors `@vitest/utils` `processError` exactly: `showDiff === true` OR (`showDiff === undefined` AND both `expected` and `actual` are present).

### Config merging

`plugin config` is the base; `cliConfig(CUCUMBER_OPTIONS)` values overwrite it. `parallel` is always forbidden — parallelism is Vitest's responsibility.

### `CUCUMBER_WORKER_ID`

Set equal to `VITEST_WORKER_ID` before running Cucumber so step definitions can detect the worker index.

## File Conventions

- All source files use ESM (`import`/`export`), `.ts` extensions in import paths
- `path.extname(import.meta.filename)` is used to resolve sibling util paths so the same code works in both `src/` (dev) and `dist/` (published)
- No barrel files other than `src/index.ts`
- Tests live in `__tests__/` folders co-located with source; excluded from the build via `!**/__*__/**`

## Cucumber version compatibility

`@cucumber/cucumber` v12 and v13 are both supported as peer dependencies.

- **v13 breaking change**: `BeforeAll`/`AfterAll` hook failures no longer reject `runCucumber()`. Instead they are emitted as `testRunHookFinished` envelopes with `status: "FAILED"`. `runCucumber.ts` collects these into a `hookErrors: Error[]` array and throws `hookErrors[0]` after `cucumberApi.runCucumber()` resolves.
- **Formatter path**: The silent formatter path is passed as `"${pathToFileURL(path).href}"` — a `file://` URL wrapped in double quotes. The file URL satisfies Node ESM's loader (which rejects bare Windows paths), and the double quotes prevent Cucumber 13's `splitFormatDescriptor` from mis-splitting on the `:` in `D:\...` paths.

## Dependencies

- `@cucumber/cucumber` — runtime, API, ArgvParser (internal)
- `@cucumber/messages` — envelope types, `getWorstTestStepResult`
- `@cucumber/query` — `Query` helper for envelope lookups
- `glob` — support file globbing in `loadSupport.ts`
- `string-argv` — parses `CUCUMBER_OPTIONS` string into argv array

## Publishing

```bash
pnpm ci:publish   # build + pnpm publish --provenance --access public --no-git-checks
```

Exports are rewritten at publish time via `publishConfig.exports` in `package.json` to point at `dist/` instead of `src/`.
