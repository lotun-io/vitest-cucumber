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
│   ├── taskBridge.ts     — Node-side dispatch* helpers; channel bound per-run via AsyncLocalStorage
│   ├── cucumberShim.ts   — browser-realm "@cucumber/cucumber" replacement (registry + bridge + World/world/context)
│   ├── loadSupport.ts    — registers browser-reported steps/hooks/param-types as native Node proxies
│   ├── wire.ts           — Node↔page serialization: DataTable marker + opaque handle for non-cloneable values
│   ├── dataTable.ts      — verbatim DataTable port (browser-safe, pure string manipulation)
│   └── status.ts         — browser-safe TestStepResultStatus constant copy
└── utils/                — SHARED (node + browser)
    ├── runCucumber.ts    — Cucumber runtime invocation; emits a results Map; supportWithHook() strips test-run hooks
    ├── registerFeatureTests.ts — registers the results Map as Vitest describe/test blocks (Rule grouping); surfaces attachments as test annotations
    ├── config.ts         — cliArgs() parses CUCUMBER_OPTIONS via ArgvParser (incl. --profile/--config); mergeConfig() resolves the effective config (profile-aware); resolveRunConfiguration() builds the IRunConfiguration; resolveSupportGlobs() returns the profile-resolved step globs as ONE flat string[] (import+require merged, default fallback) for the browser plugin AND node/loadSupport
    ├── createBaseTest.ts — wraps vitest's test.extend to register a worker-scoped auto-fixture that calls onCleanup at worker teardown
    ├── publish.ts         — --publish: writeEnvelopes() (per-project subdir), mergeEnvelopeStream() (fold N runs → 1 report), publishReport(projectName) (merge→gzip→PUT, best-effort)
    ├── publishGlobalSetup.ts — Vitest globalSetup: setup(project) → teardown publishes THIS project's report
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

- **Vitest projects**: `unit`, `node(isolate:true)`, `node-shared(isolate:false)`, `browser(isolate:true)`, `browser-shared(isolate:false)` (chromium via Playwright). The `*-shared` projects pass `worldParameters: { ..., shared: true }` and run `features/world-shared-true.feature` (excluded from non-shared projects via `test.exclude`); non-shared projects run `features/world-shared-false.feature`. This arrangement verifies that each browser project receives its own independent `runConfiguration` even when projects run concurrently — if a project leaked another's config, the world-parameter assertion would fail.
- **Unit tests**: `src/**/__tests__/**/*.test.ts` — includes the in-Node **bridge harness** (`src/browser/__tests__/bridge.test.ts`) and `taskBridge.test.ts`, which drive the browser-mode Node-side host (`commands`/`channel`/`taskBridge`/`loadSupport`) under the Node v8 provider.
- **Functional tests**: `features/**/*.feature` — ONE shared, realm-agnostic feature/step set run by every cucumber project; browser-only scenarios are tagged `@notNode`, node-only `@notBrowser`.
- **Coverage**: thresholds are 90/80/90/90 and `pnpm test` **passes** (≈92.8/82.5/93.1/92.9). Browser-realm files (`cucumberShim.ts`, `browser/runner.ts`, `dataTable.ts`, `status.ts`) are instrumented by the browser project's page coverage; the browser Node-side host files are instrumented by the in-Node bridge harness + unit tests. Remaining gaps are intentional (defensive throws, `plugin.ts` browser hooks, the `setDefaultTimeout` setter).

## Mode selection & the plugin

`plugin.ts` exposes `nodeCucumber`/`browserCucumber`, both `enforce: "pre"`, each gated by `apply`. The browser plugin additionally:

- `config()` registers the Node-side commands (`createCucumberCommands(config)`) under `test.browser.commands`, and sets `optimizeDeps.exclude: ["@cucumber/cucumber"]`.
- `resolveId()` redirects `"@cucumber/cucumber"` → `browser/cucumberShim.ts` **only in the browser realm** (`!options.ssr`). Without this, the real CJS runtime leaks into the page → `does not provide an export named 'default'`.
- `transform()` is **async**: it resolves the effective config once (`resolveSupportGlobs(config)`, memoised) and emits a thin wrapper whose `import.meta.glob([...import, ...require], { eager: true })` loads step/support files **in the browser** for their registration side effects. The resolved (profile-aware) glob list — both Cucumber keys, mapped to Vite root-relative patterns — is baked as a **literal** (Vite requires `import.meta.glob`'s argument to be statically analyzable). Because it's fixed at transform time, changing profiles/config needs a re-run.

## Node mode flow (`node/runner.ts`)

Both modes converge on **dry-run plan → register tests → real run streamed via `onTestCaseFinished`**:

1. `resolveRunConfiguration({ config, loadSupportPath })` → `runConfiguration` + the profile-resolved `merged` flat config; `loadSupport(runConfiguration)` (cached module-scoped per worker). The step globs fed to our own loader come from `merged.import`/`require`.
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
- **`commands.ts`** (Node) hosts the run: `cucumberMetadata` (version + lifecycle feature path), `cucumberRun` (whole-feature run; dry-run plan or real run; streams each scenario back as a `testCaseFinished` channel task), `cucumberNextTask`/`cucumberReportTask` (the pull loop), `cucumberEnd`. Every command takes either nothing or a single options object — no positional `undefined` for the RPC to drop.
- **`channel.ts`** is a FIFO queue: Node `dispatch`es step/hook tasks; the browser `runner.ts` pulls them (`cucumberNextTask`), runs the body via the shim, and reports (`cucumberReportTask`). `testCaseFinished` events are streamed fire-and-forget, so a queue (not a single slot) is required. `BrowserChannel` also owns `testStepErrors: Map<string, SerializedError>` — a per-page map for capturing rich step errors from `AfterStep` (scoped here because Vitest defaults to `floor(cpuCount/2)` concurrent browser pages, and a single shared map would race).
- **`loadSupport.ts`** (Node, the Cucumber support import) registers a native proxy per browser-reported step/hook/param-type; each proxy `dispatch`es its body to the browser by key. Step files never load in Node. `AfterStep` writes failed step errors to `getCurrentChannel()?.testStepErrors` (the ALS-bound per-page map) rather than a shared global.

### Multi-project browser isolation (`commands.ts`)

All browser projects share the same Node main process (the Vite server). `createCucumberCommands` is called once per project; four mechanisms ensure each project gets independent state:

1. **`registerHooks`** (module-level, runs once): intercepts every `loadSupport.ts` import and appends `?p=uuid` to the resolved URL. Node's ESM cache treats each unique URL as a separate module, so `loadSupport.ts` re-evaluates per project and registers its step proxies into the fresh `supportCodeLibraryBuilder` context.
2. **`sharedSupport`** (closure-level, per `createCucumberCommands` call): caches `{ runConfiguration, support }` per project. `ensureSupport()` uses `??=` so concurrent sessions within the same project share one build.
3. **`buildQueue`** (module-level FIFO): serializes concurrent `buildSharedSupport` calls across projects. The critical section (writing `globalRef.support` + calling `loadSupport`) is enqueued; the independent work (`dispatchGetRegistry` + `resolveRunConfiguration`) runs in parallel beforehand via `Promise.all`.
4. **`channel.testStepErrors`** (per `BrowserChannel` instance = per page): each concurrent page's `AfterStep` writes to its own map, read by `runCucumber` via the ALS-bound channel (`getCurrentChannel()`). The `testStepErrors.clear()` in `runCucumber.ts` is a no-op on the correct per-page map and correctly resets it between retries within the same run.

### Cucumber API supported in browser mode

| API                                                            |                                 | API                            |                                      |
| -------------------------------------------------------------- | :-----------------------------: | ------------------------------ | :----------------------------------: |
| `Given`/`When`/`Then`/`defineStep`                             |               ✅                | `defineParameterType`          |  ✅ (transform round-trips to page)  |
| `Before`/`After`/`BeforeStep`/`AfterStep` (+ tags/options/arg) |               ✅                | `world` (v10.8+)               |         ✅ (full-trap Proxy)         |
| `BeforeAll`/`AfterAll`                                         |     ✅ (per-feature/worker)     | `context` (v11+)               |         ✅ (run-scope Proxy)         |
| Callback interface                                             |               ✅                | `DataTable` / DocString        |                  ✅                  |
| `setWorldConstructor` / `World` / `IWorldOptions`              |               ✅                | `attach`/`log`/`link`          | ✅ (string/base64; replayed on Node) |
| `setDefaultTimeout`                                            |               ✅                | `wrapPromiseWithTimeout`       |                  ✅                  |
| `Status`                                                       |               ✅                | `setDefinitionFunctionWrapper` |                  ✅                  |
| `setParallelCanAssign`                                         | ✅ (no-op — parallel forbidden) | —                              |                                      |

Key browser-mode mechanisms:

- **World / `parameters`** — the base `World` is ported into the shim; `WorldCtor` defaults to it. `newWorld(parameters)` builds `new WorldCtor({ attach, log, link, parameters })`. `parameters` is plumbed Node→browser: the Node `Before(resetWorld)` hook's `this` is Node's real World, so it forwards `this.parameters`.
- **`world`/`context`** — Proxies whose handler is built by enumerating `Reflect` and forwarding every trap to `requireWorld()`/`requireContext()` (an `activeWorld`/`activeContext` bound by `bindWorld`/`bindContext` for the body's duration). `world` is bound in steps/case-hooks; `context` only in `BeforeAll`/`AfterAll`. Each throws outside its scope.
- **`attach`/`log`/`link`** — buffered during a body and flushed onto the `BodyResult`, which step/hook bodies report **whole** over `cucumberReportTask`; the Node proxy replays each via its bound `this` (the real World) right after the dispatch resolves, so the envelope lands within the step scope. No separate command or `currentNodeWorld` global. Strings only (base64 strings for binary, the screenshot pattern).
- **`DataTable`** — native Cucumber builds it on Node; `wire.ts` serializes it to `{ __vc: "dataTable", rows }` and the shim rebuilds a real `DataTable` (verbatim port) in the page. Non-cloneable transform results are held in the page as opaque handles (`{ __vc: "handle", id }`) via `wire.ts` `hold`/`decode`.

## Shared `runCucumber` (`utils/runCucumber.ts`)

One run per feature. The `IConfiguration`/`ISupportCodeLibrary` come from the caller. `WithHook = "before" | "after" | "none"` selects which test-run hooks fire via `supportWithHook()` — it shallow-clones the support library, emptying `beforeTestRunHookDefinitions`/`afterTestRunHookDefinitions` as needed (those arrays exist on the concrete library but not the public `ISupportCodeLibrary` type, so a local `TestRunHookDefinitions` cast narrows it). Results are a `Map<pickleId, ResultItem>` in Cucumber's actual execution order (incl. `order: random` seed). When `publish` is passed, the raw Cucumber envelopes are also collected and returned with `startedAt` (for `--publish`; see the Publish section). `ResultItem` carries `id`/`name`/`lineage`/`status`/`stepResult`/`step`/`error`/`attachments` and (when registered) `resolvers`; status/step/error/attachments are mutated in-place by the `testStepFinished` handler and reset on `testCaseStarted` (retries). `registerFeatureTests` groups consecutive same-`Rule` scenarios into a shared `describe`, and surfaces each scenario's `attachments` as Vitest test annotations (text → `bodyEncoding: "utf-8"`, binary → base64 — text MUST set utf-8 or Vitest base64-decodes the string body into garbage on download; images render inline, others get a Download link).

### Config merging (`utils/config.ts`)

Resolution is **two passes of Cucumber's own `loadConfiguration`**, so named profiles and an explicit config file behave like native cucumber-js (precedence **provided > profile > default**):

- `cliArgs(CUCUMBER_OPTIONS)` runs `ArgvParser`, splitting `--profile` (repeatable) and `--config` into a loader bucket (`{ profiles, file }`) from the ad-hoc `configuration`.
- `mergeConfig(config)` (async) — **pass 1**: `loadConfiguration({ file, profiles, provided: { ...pluginConfig, ...cliConfiguration, paths: [] } })`. It auto-locates a `cucumber.*` config file when no `--config` is given (so a default profile already applies). Our invariants are imposed on the **resolved** flat config — so they also catch profile-supplied values: `order: "random"` is pinned to a concrete seed (dry-run plan and real run agree on order); `parallel` is forbidden (Vitest owns parallelism).
- `resolveRunConfiguration({ config, loadSupportPath })` — **pass 2**: `loadConfiguration({ file: false, provided: { ...merged, paths: [], import: [loadSupportPath], require: [], format } })`. `file: false` makes `provided` authoritative; `import` is forced to our support-bridge loader. A user-provided `format` is **preserved** — the silent formatter is only injected when none is configured. Returns `{ runConfiguration, mergedConfig }`; the runners feed `mergedConfig.import`/`require` (profile-resolved step globs) to their own module loader.

Browser note: the page's step globs are resolved (profile-aware) at transform time via `resolveSupportGlobs(config)` in `plugin.ts` (memoised) and baked into the literal `import.meta.glob`, so profile/config `import` **and** `require` globs reach the browser bundle too (both are additive arrays in Cucumber's merge, so profile globs concatenate with the plugin's; the page loads `require` files as ESM via Vite). The only caveat is that the glob is fixed at transform time, so changing profiles/config requires a re-run.

### Error attribution (`utils/createError.ts`)

Builds a synthetic `.stack` pointing at the failing line in the `.feature` file — this is what makes errors clickable in VS Code. `err.stack = [cucumberError, ...frames].join("\n")` (no trailing newline when `frames` is empty, e.g. hook errors). Frames: `at Scenario`, `at Example` (outlines only), `at Step` — each only when its location is present. When a diff should show, `err.message` is replaced with the bare assertion sentence so Vitest doesn't render the diff twice (condition mirrors `@vitest/utils` `processError`: `showDiff === true` OR `showDiff === undefined && expected !== undefined && actual !== undefined`).

### `serializeError` (`utils/serializeError.ts`)

Errors cross the Vitest command / channel boundary, so they're flattened to a plain object: `message`/`name`/`stack` plus every other own-enumerable prop that survives `structuredClone` (non-serializable values like functions/symbols are skipped). Used everywhere a raw `Error` would otherwise be serialized.

### `CUCUMBER_WORKER_ID`

Set equal to `VITEST_WORKER_ID` before running Cucumber so step definitions can detect the worker index.

## Publish (`--publish`)

`CUCUMBER_OPTIONS="--publish"` uploads **one report per Vitest project** to the Cucumber Reports service (node + browser). cucumber's native per-run publish is suppressed (`resolveRunConfiguration` forces `publish: false`); the plugin collects envelopes itself and uploads once per project at teardown.

- **Provision** (`plugin.ts` `providePublishDir`): each plugin's `config()` (main process), when the merged config has `publish`, `mkdtemp`s a run base dir ONCE (`process.env[VITEST_CUCUMBER_PUBLISH_DIR] ??= …`) and surfaces it via `process.env` (for the globalSetup teardown + browser command host, both in the node/main process) AND `test.env` (so workers get it pool-agnostically — `test.env` reaches workers but NOT the command host, hence both channels). Also registers `test.globalSetup: [publishGlobalSetup]`.
- **Collect** (`utils/runCucumber.ts`): when `publish` is passed, the raw Cucumber envelopes are pushed to an array and returned alongside `startedAt` (zero cost when off).
- **Write** (`utils/publish.ts` `writeEnvelopes`): each feature/AfterAll run appends its envelopes as a timestamp-prefixed JSONL file into `base/sha1(projectName)/` — a per-project subdir. `projectName` is supplied per realm: node = `globalRef.__vitest_worker__.ctx.projectName` (the worker); browser = the `cucumberRun` command's `ctx.project?.name` (the Node command host — NOT a worker, so no `__vitest_worker__`). Both are the decorated runtime name (e.g. `"browser (chromium)"`), matching the teardown. `projectDirName(name || "default")` handles the no-projects/empty-name config on both sides.
- **Publish** (`utils/publishGlobalSetup.ts`: `setup(project)` → teardown → `publishReport(project.name)`): each project's teardown merges its OWN subdir's JSONL files into ONE report (`mergeEnvelopeStream`: keep first `meta`/`testRunStarted`, rewrite every `testRunStartedId` back-ref to it, synthesize one `testRunFinished`), streams merge → JSONL → gzip → disk → PUT (constant memory), prints the banner headed by the project name, then removes the subdir (+ best-effort `rmdir` base). Because `project.name` from `setup(project)` matches the workers' subdir, there's NO label file and NO cross-project scan → one report per project, no duplication, no first-wins race.
- **Errors are best-effort** (faithful port of cucumber-js `publish_plugin.js`): touch `>= 500` and upload-not-ok → `console.error` (+ the response body); touch-not-ok (e.g. bad token) → print the service banner; the whole network block is wrapped in `try/catch` so a network rejection LOGS instead of failing the run — unlike cucumber-js (a post-run formatter) we run in a globalSetup teardown, where an uncaught throw WOULD fail the Vitest run. Token/URL from `CUCUMBER_PUBLISH_TOKEN`/`CUCUMBER_PUBLISH_URL`.

Caveats: `--publish` + `--coverage` in THIS repo triggers a one-time browser optimizer reload (coverage instruments the Node-side publish graph because tests run against `src/` in source mode); consumers don't hit it (the lib is in `node_modules`, which coverage excludes — verified by packing). `ctx.projectName` / `ctx.project.name` are internal Vitest fields (same risk class as the rest of the `globalRef` bridge).

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
- `tinyglobby` — support-file globbing in `node/loadSupport.ts`
- `string-argv` — parses `CUCUMBER_OPTIONS` into argv
- `stream-chain` — `jsonl/parserStream` + `jsonl/stringerStream` for the streamed `--publish` JSONL merge

## Publishing

```bash
pnpm ci:publish   # build + pnpm publish --provenance --access public --no-git-checks
```

Exports are rewritten at publish time via `publishConfig.exports` in `package.json` to point at `dist/` instead of `src/`.
