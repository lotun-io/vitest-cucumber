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
    ├── parser.ts         — Gherkin parse (feature name, scenario names, line numbers)
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

### Real-time streaming with concurrent tests

Each scenario is registered as a `test.concurrent` with timeout `0`. All tests start simultaneously when `beforeAll` fires. Each test awaits a `Promise<unknown>` stored inside its `ResultItem.resolvers` — a `PromiseWithResolvers` created upfront in `runner.ts` before `beforeAll`. The `testCaseFinished` envelope handler in `runCucumber.ts` resolves the promise for that scenario. A `.finally()` on `runCucumberPromise` resolves any remaining promises (tag-filtered scenarios that never fire `testCaseFinished`) so tests don't hang.

### Scenario key

`getScenarioKey` in `parser.ts` returns `"${scenarioLine}:${exampleLine}"` for outline rows and `"${scenarioLine}:undefined"` for plain scenarios. This format is stable — line numbers come from the `.feature` source — and is used as the key for both the `Results` map and the `resolvers` map. Both `parseFeature` and the Cucumber envelope handlers call the same function, so keys always match.

### Scenario name deduplication

Duplicate scenario names within the same rule group get `" (2)"`, `" (3)"` suffixes appended by `registerFeatureTests` using a per-rule `nameCount` map. `parser.ts` does not deduplicate — it returns raw `pickle.name`. Deduplication is purely a display concern in `registerFeatureTests`.

### ResultItem shape

`ResultItem` embeds `resolvers: PromiseWithResolvers<unknown>` alongside status/step/error fields. Results are pre-allocated in `runner.ts` (one entry per pickle key) before `beforeAll`. The `testStepFinished` handler mutates the entry in-place; `testCaseFinished` resolves the promise.

### Support code loading

`loadSupport.ts` is loaded as a fake Cucumber "import" path so it runs inside the Cucumber bootstrap, but all user step files are imported via `moduleLoader` (Vitest's `import(specifier)`). This ensures coverage instrumentation and module mocking apply to step definitions.

An `AfterStep` hook in `loadSupport.ts` captures the raw `Error` object per `testStepId` into the `testStepErrors` map. `AfterStep` fires inside `runStepFn()` before the `testStepFinished` envelope is emitted, so the map is always populated when the envelope handler reads it.

### Worker-level cache

`cache` in `runner.ts` is module-scoped. When `isolate: false`, the same worker reuses cached `runConfiguration` and `ISupportCodeLibrary` across feature files. Clear `testStepErrors` (not the whole cache) between runs. The `mergedConfig` computation (including `cliConfig()`) is done once inside the `if (!cache)` block.

### parseFeature

`parseFeature` is `async` and returns `{ featureName, pickles }` where each pickle is `{ key, name, lineage }`. The `lineage` object comes from `@cucumber/query` and gives access to `lineage.scenario`, `lineage.example`, `lineage.rule`, etc. — use these instead of `pickle.name` for location/rule info.

### Error attribution

`createError.ts` builds a synthetic `.stack` pointing at the failing line in the `.feature` file — this is what makes errors clickable in VS Code. Preserve the `at <featureFileId>:<line>:<col>` format.

`err.stack` starts with `cucumberError` (the full Cucumber message). When a diff should be shown, `err.message` is replaced with the bare assertion sentence so Vitest does not render the diff twice. The condition mirrors `@vitest/utils` `processError` exactly: `showDiff === true` OR (`showDiff === undefined` AND both `expected` and `actual` are present).

### Config merging

`plugin config` is the base; `cliConfig(CUCUMBER_OPTIONS)` values overwrite it. `parallel` is always deleted — parallelism is Vitest's responsibility.

### `CUCUMBER_WORKER_ID`

Set equal to `VITEST_WORKER_ID` before running Cucumber so step definitions can detect the worker index.

## File Conventions

- All source files use ESM (`import`/`export`), `.ts` extensions in import paths
- `path.extname(import.meta.filename)` is used to resolve sibling util paths so the same code works in both `src/` (dev) and `dist/` (published)
- No barrel files other than `src/index.ts`
- Tests live in `__tests__/` folders co-located with source; excluded from the build via `!**/__*__/**`

## Dependencies

- `@cucumber/cucumber` — runtime, API, ArgvParser (internal)
- `@cucumber/gherkin` — Gherkin parser
- `@cucumber/messages` — envelope types, `getWorstTestStepResult`
- `@cucumber/query` — `Query` helper for envelope lookups
- `glob` — support file globbing in `loadSupport.ts`
- `string-argv` — parses `CUCUMBER_OPTIONS` string into argv array

## Publishing

```bash
pnpm ci:publish   # build + pnpm publish --provenance --access public --no-git-checks
```

Exports are rewritten at publish time via `publishConfig.exports` in `package.json` to point at `dist/` instead of `src/`.
