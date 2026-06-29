# @lotun/vitest-cucumber — Project Guidelines

## Overview

A Vitest plugin that runs Gherkin `.feature` files as native Vitest tests using the official `@cucumber/cucumber` runtime. The plugin intercepts `.feature` files during Vite's `transform` phase and rewrites them into JS that calls `runFeatureFile()`.

It supports **two modes**, selected automatically per Vitest project:

- **Node mode** (default) — Cucumber runs in Node; step/hook bodies run in Node.
- **Browser mode** (`test.browser.enabled`) — Cucumber's orchestration (parse/match/schedule/results) runs in Node, while step/hook bodies **and the World run in the browser test realm**, bridged over Vitest's Commands API.

`cucumber(config)` returns **`Plugin[]` = `[nodeCucumber, browserCucumber]`**; each self-selects via `apply: (cfg) => !/isBrowserEnabled(cfg)`. Vite flattens the nested array, so `plugins: [cucumber(...)]` works.

## Architecture

```
src/
├── index.ts              — re-exports plugin.ts (public API: cucumber())
├── plugin.ts             — returns [nodeCucumber, browserCucumber]; transforms .feature → JS
├── features/
│   └── lifecycle.feature — empty feature (no scenarios) used to drive a standalone AfterAll run
├── node/                 — NODE-MODE runtime
│   ├── runner.ts         — runFeatureFile(): per-feature orchestrator, worker support cache, BeforeAll/AfterAll lifecycle
│   └── loadSupport.ts    — globs & imports step/support files via Vitest's moduleLoader; AfterStep error capture
├── browser/              — BROWSER-MODE runtime
│   ├── commands.ts       — Node-side Vitest commands (cucumberMetadata/Run/NextTask/ReportTask/End)
│   ├── runner.ts         — browser-realm runFeatureFile(): dry-run plan → register tests → pull loop
│   ├── channel.ts        — BrowserChannel: FIFO async task queue between Node command and browser pull loop
│   ├── taskBridge.ts     — Node-side dispatch* helpers + currentNodeWorld capture
│   ├── cucumberShim.ts   — browser-realm "@cucumber/cucumber" replacement (registry + bridge + World/world/context)
│   ├── loadSupport.ts    — registers browser-reported steps/hooks/param-types as native Node proxies
│   ├── dataTable.ts      — verbatim DataTable port + serialization marker
│   └── status.ts         — browser-safe TestStepResultStatus constant copy
└── utils/                — SHARED (node + browser)
    ├── runCucumber.ts    — Cucumber runtime invocation; emits a results Map; supportWithHook() strips test-run hooks
    ├── registerFeatureTests.ts — registers the results Map as Vitest describe/test blocks (Rule grouping); surfaces attachments as test annotations
    ├── config.ts         — cliConfig() parses CUCUMBER_OPTIONS via ArgvParser; mergeConfig() resolves the effective config
    ├── serializeError.ts — serializeError(): plain, structured-clone-safe error for the Vitest/command boundary
    ├── createError.ts    — maps Cucumber failures to a Vitest-friendly Error with a clickable .feature .stack
    ├── silentFormatter.ts — no-op Cucumber formatter (suppresses CLI output)
    └── globals.ts        — typed globalThis bridge: __vitest_cucumber_node__ / __vitest_cucumber_browser__ / __vitest_worker__
```

`src/features/lifecycle.feature` is copied to `dist/features/lifecycle.feature` at build time via tsdown's `copy: [{ from: "src/features/lifecycle.feature", to: "dist/features" }]`. Both runners resolve it with `path.join(import.meta.dirname, "..", "features", "lifecycle.feature")`, which lands on `src/features/` in dev and `dist/features/` when published.

## Build & Test

```bash
pnpm build          # tsdown — outputs ESM to dist/, unbundled, with .d.mts types
pnpm test           # vitest run --coverage (projects: unit, node×isolate, browser×isolate)
pnpm lint           # tsc + prettier check + eslint
pnpm format         # prettier write + eslint --fix
```

- **Vitest projects**: `unit`, `node(isolate:true)`, `node(isolate:false)`, `browser(isolate:true)`, `browser(isolate:false)` (chromium via Playwright).
- **Unit tests**: `src/**/__tests__/**/*.test.ts` — includes the in-Node **bridge harness** (`src/browser/__tests__/bridge.test.ts`) and `taskBridge.test.ts`, which drive the browser-mode Node-side host (`commands`/`channel`/`taskBridge`/`loadSupport`) under the Node v8 provider.
- **Functional tests**: `features/**/*.feature` — ONE shared, realm-agnostic feature/step set run by every cucumber project; browser-only scenarios are tagged `@notNode`, node-only `@notBrowser`.
- **Coverage**: thresholds are 90/80/90/90 and `pnpm test` **passes** (≈92.8/82.5/93.1/92.9). Browser-realm files (`cucumberShim.ts`, `browser/runner.ts`, `dataTable.ts`, `status.ts`) are instrumented by the browser project's page coverage; the browser Node-side host files are instrumented by the in-Node bridge harness + unit tests. Remaining gaps are intentional (defensive throws, `plugin.ts` browser hooks, the `setDefaultTimeout` setter).

## Mode selection & the plugin

`plugin.ts` exposes `nodeCucumber`/`browserCucumber`, both `enforce: "pre"`, each gated by `apply`. The browser plugin additionally:

- `config()` registers the Node-side commands (`createCucumberCommands(config)`) under `test.browser.commands`, and sets `optimizeDeps.exclude: ["@cucumber/cucumber"]`.
- `resolveId()` redirects `"@cucumber/cucumber"` → `browser/cucumberShim.ts` **only in the browser realm** (`!options.ssr`). Without this, the real CJS runtime leaks into the page → `does not provide an export named 'default'`.
- `transform()` emits a thin wrapper whose `import.meta.glob(globs, { eager: true })` loads step/support files **in the browser** for their registration side effects (the glob string must stay literal for Vite's static analysis).

## Node mode flow (`node/runner.ts`)

Both modes converge on **dry-run plan → register tests → real run streamed via `onTestCaseFinished`**:

1. `mergeConfig(config)` → `loadConfiguration` → `runConfiguration`; `loadSupport(runConfiguration)` (cached module-scoped per worker).
2. **Dry run** (`dryRun: true`) `runCucumber` → a results `Map` (the scenario tree, no bodies executed).
3. Build a `results` Map, giving each entry a `resolvers: Promise.withResolvers()`, and call `registerFeatureTests({ id, featureName, results })` — one `test` per scenario (timeout 0), each `await`ing `result.resolvers.promise` and then surfacing the scenario's attachments as annotations.
4. **Real run** `runCucumber({ onTestCaseFinished })` — the callback `Object.assign`s the finished `ResultItem` onto the registered entry and resolves its `resolvers`. A trailing `.finally` resolves any still-pending resolvers (tag-filtered scenarios that never fire `testCaseFinished`).
5. `afterAll(await runCucumberPromise)` surfaces parse/runtime/hook errors.

### Worker cache & BeforeAll/AfterAll

`cache` in `node/runner.ts` is module-scoped (`{ runConfiguration, support, testStepErrors }`). `isCacheReused = Boolean(cache)` is captured at entry:

- **BeforeAll** runs inline with the worker's first feature (`withHook: isCacheReused ? "none" : "before"`).
- **AfterAll** runs once at worker teardown: inside the `if (!cache)` block, `worker?.onCleanup?.()` (private Vitest API, optional-chained) registers a callback that runs `runCucumber` against the empty `lifecycle.feature` with `withHook: "after"`.

Frequency is **self-adjusting** with the user's `isolate` setting (never forced): `isolate: false` → BeforeAll once on the first feature, AfterAll once at worker stop; `isolate: true` → both per feature. The browser runner mirrors this exactly (its own cache + `onCleanup` + `cucumberAfterAll`).

## Browser mode flow (the bridge)

Node runs the native Cucumber runtime; each step/hook/transform body + the World run in the **browser** realm. The bridge is **Vitest Commands only** (provider-agnostic — playwright/webdriverio/preview).

- **`cucumberShim.ts`** (browser realm) is the `"@cucumber/cucumber"` replacement: `Given/Before/...` store definitions in a `BrowserRegistry`; a `BrowserBridge` (on `globalThis.__vitest_cucumber_browser__`) exposes `runStep`/`runHook`/`runTransform`/`runTestRunHook`/`newWorld`/`get*`. Bodies are invoked by key.
- **`commands.ts`** (Node) hosts the run: `cucumberPlan` (dry run for the tree), `cucumberRun` (whole-feature run; streams each scenario back as a `testCaseFinished` channel task), `cucumberNextTask`/`cucumberReportTask` (the pull loop), `cucumberAfterAll`, `cucumberEnd`.
- **`channel.ts`** is a FIFO queue: Node `dispatch`es step/hook tasks; the browser `runner.ts` pulls them (`cucumberNextTask`), runs the body via the shim, and reports (`cucumberReportTask`). `testCaseFinished` events are streamed fire-and-forget, so a queue (not a single slot) is required.
- **`loadSupport.ts`** (Node, the Cucumber support import) registers a native proxy per browser-reported step/hook/param-type; each proxy `dispatch`es its body to the browser by key. Step files never load in Node.

### Cucumber API supported in browser mode

| API                                                            |                         | API                                                     |                                          |
| -------------------------------------------------------------- | :---------------------: | ------------------------------------------------------- | :--------------------------------------: |
| `Given`/`When`/`Then`/`defineStep`                             |           ✅            | `defineParameterType`                                   |    ✅ (transform round-trips to page)    |
| `Before`/`After`/`BeforeStep`/`AfterStep` (+ tags/options/arg) |           ✅            | `world` (v10.8+)                                        |           ✅ (full-trap Proxy)           |
| `BeforeAll`/`AfterAll`                                         | ✅ (per-feature/worker) | `context` (v11+)                                        |           ✅ (run-scope Proxy)           |
| Callback interface                                             |           ✅            | `DataTable` / DocString                                 |                    ✅                    |
| `setWorldConstructor` / `World` / `IWorldOptions`              |           ✅            | `attach`/`log`/`link`                                   |   ✅ (string/base64; replayed on Node)   |
| `setDefaultTimeout`                                            |           ✅            | `wrapPromiseWithTimeout`                                |                    ✅                    |
| `Status`                                                       |           ✅            | `setDefinitionFunctionWrapper`                          |                    ✅                    |
| `setParallelCanAssign`                                         | ✅ (no-op — parallel forbidden) | —                                                       |                                          |

Key browser-mode mechanisms:

- **World / `parameters`** — the base `World` is ported into the shim; `WorldCtor` defaults to it. `newWorld(parameters)` builds `new WorldCtor({ attach, log, link, parameters })`. `parameters` is plumbed Node→browser: the Node `Before(resetWorld)` hook's `this` is Node's real World, so it forwards `this.parameters`.
- **`world`/`context`** — Proxies whose handler is built by enumerating `Reflect` and forwarding every trap to `requireWorld()`/`requireContext()` (an `activeWorld`/`activeContext` bound by `bindWorld`/`bindContext` for the body's duration). `world` is bound in steps/case-hooks; `context` only in `BeforeAll`/`AfterAll`. Each throws outside its scope.
- **`attach`/`log`/`link`** — buffered during a body and flushed onto the `BodyResult`, which step/hook bodies report **whole** over `cucumberReportTask`; the Node proxy replays each via its bound `this` (the real World) right after the dispatch resolves, so the envelope lands within the step scope. No separate command or `currentNodeWorld` global. Strings only (base64 strings for binary, the screenshot pattern).
- **`DataTable`** — native Cucumber builds it on Node; the proxy serializes it to a `{ [DATA_TABLE_MARKER]: raw }` marker, and the shim rebuilds a real `DataTable` (verbatim port) in the page.

## Shared `runCucumber` (`utils/runCucumber.ts`)

One run per feature. The `IConfiguration`/`ISupportCodeLibrary` come from the caller. `WithHook = "before" | "after" | "none"` selects which test-run hooks fire via `supportWithHook()` — it shallow-clones the support library, emptying `beforeTestRunHookDefinitions`/`afterTestRunHookDefinitions` as needed (those arrays exist on the concrete library but not the public `ISupportCodeLibrary` type, so a local `TestRunHookDefinitions` cast narrows it). Results are a `Map<pickleId, ResultItem>` in Cucumber's actual execution order (incl. `order: random` seed). `ResultItem` carries `id`/`name`/`lineage`/`status`/`stepResult`/`step`/`error`/`attachments` and (when registered) `resolvers`; status/step/error/attachments are mutated in-place by the `testStepFinished` handler and reset on `testCaseStarted` (retries). `registerFeatureTests` groups consecutive same-`Rule` scenarios into a shared `describe`, and surfaces each scenario's `attachments` as Vitest test annotations (text → `bodyEncoding: "utf-8"`, binary → base64 — text MUST set utf-8 or Vitest base64-decodes the string body into garbage on download; images render inline, others get a Download link).

### Config merging (`utils/config.ts`)

`mergeConfig(config)` is shared by both runners: plugin config is the base; `cliConfig(CUCUMBER_OPTIONS)` overrides it; `order: "random"` is pinned to a concrete seed (so a dry-run plan and the real run agree on order); `parallel` is always forbidden — parallelism is Vitest's responsibility.

### Error attribution (`utils/createError.ts`)

Builds a synthetic `.stack` pointing at the failing line in the `.feature` file — this is what makes errors clickable in VS Code. `err.stack = [cucumberError, ...frames].join("\n")` (no trailing newline when `frames` is empty, e.g. hook errors). Frames: `at Scenario`, `at Example` (outlines only), `at Step` — each only when its location is present. When a diff should show, `err.message` is replaced with the bare assertion sentence so Vitest doesn't render the diff twice (condition mirrors `@vitest/utils` `processError`: `showDiff === true` OR `showDiff === undefined && expected !== undefined && actual !== undefined`).

### `serializeError` (`utils/serializeError.ts`)

Errors cross the Vitest command / channel boundary, so they're flattened to a plain object: `message`/`name`/`stack` plus every other own-enumerable prop that survives `structuredClone` (non-serializable values like functions/symbols are skipped). Used everywhere a raw `Error` would otherwise be serialized.

### `CUCUMBER_WORKER_ID`

Set equal to `VITEST_WORKER_ID` before running Cucumber so step definitions can detect the worker index.

## File Conventions

- All source files use ESM (`import`/`export`), `.ts` extensions in import paths.
- `path.extname(import.meta.filename)` resolves sibling/relative paths so the same code works in both `src/` (dev) and `dist/` (published).
- No barrel files other than `src/index.ts`.
- Tests live in `__tests__/` folders co-located with source; excluded from the build via `!**/__*__/**`.
- The `globalThis` bridge is typed once in `utils/globals.ts` (`globalRef`); never re-`declare global` elsewhere.

## Cucumber version compatibility

`@cucumber/cucumber` v12 and v13 are both supported as peer dependencies.

- **v13 breaking change**: `BeforeAll`/`AfterAll` failures no longer reject `runCucumber()`; they're emitted as `testRunHookFinished` envelopes with `status: "FAILED"`. `runCucumber.ts` collects these into `hookErrors: Error[]` and throws `hookErrors[0]` after `cucumberApi.runCucumber()` resolves.
- **Formatter path**: the silent formatter is passed as `"${pathToFileURL(path).href}"` — a `file://` URL wrapped in double quotes. The URL satisfies Node ESM's loader (which rejects bare Windows paths); the quotes stop Cucumber 13's `splitFormatDescriptor` from mis-splitting on the `:` in `D:\...`.

## Dependencies

- `@cucumber/cucumber` — runtime, API, ArgvParser (internal `lib/configuration`)
- `@cucumber/messages` — envelope types, `getWorstTestStepResult`
- `@cucumber/query` — `Query` helper for envelope lookups
- `glob` — support-file globbing in `node/loadSupport.ts`
- `string-argv` — parses `CUCUMBER_OPTIONS` into argv

## Publishing

```bash
pnpm ci:publish   # build + pnpm publish --provenance --access public --no-git-checks
```

Exports are rewritten at publish time via `publishConfig.exports` in `package.json` to point at `dist/` instead of `src/`.
