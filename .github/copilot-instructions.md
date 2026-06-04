# @lotun/vitest-cucumber — Project Guidelines

## Overview

A Vitest plugin that runs Gherkin `.feature` files as native Vitest tests using the official `@cucumber/cucumber` runtime. The plugin intercepts `.feature` files during Vite's `transform` phase and replaces them with JS that calls `runFeatureFile()`.

## Architecture

```
src/
├── index.ts              — re-exports plugin.ts (public API)
├── plugin.ts             — Vite/Vitest Plugin; transforms .feature → JS
├── types/global.ts       — global augmentation for __vitestCucumber bridge object
└── utils/
    ├── runner.ts         — runFeatureFile(): per-feature orchestrator, module-scoped support cache
    ├── runCucumber.ts    — Cucumber runtime invocation + Vitest describe/test registration
    ├── loadSupport.ts    — globs & imports step definitions/hooks via Vitest's moduleLoader
    ├── config.ts         — parses CUCUMBER_OPTIONS env var using Cucumber's ArgvParser
    ├── createError.ts    — maps Cucumber failures to Vitest-friendly Error with clickable .stack
    └── silentFormatter.ts — no-op Cucumber formatter (suppresses CLI output)
```

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

`plugin.ts` transforms each `.feature` file into JS with a top-level `await runFeatureFile(...)`. This runs during Vitest's **collection phase** (module evaluation), before any tests execute. Inside `runFeatureFile`, `runCucumber` is fired **fire-and-forget** (no `await`). `runCucumber` emits an `onTestCasesReady` callback when the first `testCaseStarted` envelope arrives. That callback calls `registerFeatureTests`, which calls `describe`/`test` — valid because we're still in the collection phase. `runFeatureFile` then `await`s a `testCasesReady` promise that is resolved inside `onTestCasesReady`, unblocking the top-level await and completing collection. An `afterAll` registered after the await propagates any Cucumber runtime error.

```
plugin.ts transform → top-level await runFeatureFile()
  runFeatureFile()
    → runCucumber() fire-and-forget
        → testCase envelopes: build results map (shuffled/filtered order)
        → first testCaseStarted: onTestCasesReady → registerFeatureTests() → describe/test
                                                   → testCasesReady.resolve()
    → await testCasesReady.promise  ← unblocks here, collection complete
    → afterAll(propagate error)
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

### `pickleById` local map

`envelope.pickle` arrives before `envelope.testCase`. A local `Map<string, Pickle>` is populated in the `pickle` handler for O(1) lookup in the `testCase` handler — avoids `query.findAllPickles().find()`.

### ResultItem shape

`ResultItem` embeds `resolvers: PromiseWithResolvers<unknown>` alongside `name`, `lineage`, and status/step/error fields. Entries are allocated in `runCucumber`'s `testCase` handler — one per `testCase` envelope, keyed by `pickle.id` (UUID). `name` and `lineage` are stored directly on `ResultItem` at allocation time. The `testStepFinished` handler mutates status/step/error in-place. `testCaseFinished` resolves the promise. Fields are reset to `undefined` on `testCaseStarted` to handle retries.

### Scenario name deduplication

Duplicate scenario names within the same consecutive rule group get `" (2)"`, `" (3)"` suffixes appended by `registerFeatureTests` using a per-group `nameCount` map. Deduplication is purely a display concern.

### Support code loading

`loadSupport.ts` is loaded as a fake Cucumber "import" path so it runs inside the Cucumber bootstrap, but all user step files are imported via `moduleLoader` (Vitest's `import(specifier)`). This ensures coverage instrumentation and module mocking apply to step definitions.

An `AfterStep` hook in `loadSupport.ts` captures the raw `Error` object per `testStepId` into the `testStepErrors` map. `AfterStep` fires inside `runStepFn()` before the `testStepFinished` envelope is emitted, so the map is always populated when the envelope handler reads it.

### Worker-level cache

`cache` in `runner.ts` is module-scoped. When `isolate: false`, the same worker reuses cached `runConfiguration` and `ISupportCodeLibrary` across feature files. Clear `testStepErrors` (not the whole cache) between runs. The `mergedConfig` computation (including `cliConfig()`) is done once inside the `if (!cache)` block.

### Error attribution

`createError.ts` builds a synthetic `.stack` pointing at the failing line in the `.feature` file — this is what makes errors clickable in VS Code. Preserve the `at <featureFileId>:<line>:<col>` format.

`err.stack` starts with `cucumberError` (the full Cucumber message). When a diff should be shown, `err.message` is replaced with the bare assertion sentence so Vitest does not render the diff twice. The condition mirrors `@vitest/utils` `processError` exactly: `showDiff === true` OR (`showDiff === undefined` AND both `expected` and `actual` are present).

### Config merging

`plugin config` is the base; `cliConfig(CUCUMBER_OPTIONS)` values overwrite it. `parallel` is always forbidden — parallelism is Vitest's responsibility.

### `CUCUMBER_WORKER_ID`

Set equal to `VITEST_WORKER_ID` before running Cucumber so step definitions can detect the worker index.

## File Conventions

- All source files use ESM (`import`/`export`), `.ts` extensions in import paths
- `path.extname(import.meta.filename)` is used to resolve sibling util paths so the same code works in both `src/` (dev) and `dist/` (published)
- No barrel files other than `src/index.ts`
- Tests live in `__tests__/` folders co-located with source; excluded from the build via `!**/__*__/**`

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
