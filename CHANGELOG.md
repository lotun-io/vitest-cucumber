# @lotun/vitest-cucumber

## 1.0.0-beta.3

### Patch Changes

- Options from a config file, and a faster start

  - `cucumber()` with no options reads `cucumber.config.ts` from the project's root (or `.mts`, `.cts`, `.js`, `.mjs`, `.cjs`, `.json`). `cucumber(options)` uses those options and reads no file. Each run reads the file again.
  - Storybook: the options are always `.storybook/cucumber.config.ts`'s, for Storybook and its story tests alike, and the Storybook test project calls `cucumber()` without options. Options passed to it there aren't used.
  - Vitest's main process, and Storybook's, start about 125 ms sooner and use about 44 MB less memory: the options no longer go through Cucumber's configuration loader.
  - An `import` that isn't an array of strings, or a `language` Gherkin doesn't have, fails with the plugin's own message.

## 1.0.0-beta.2

### Patch Changes

- Storybook: a feature is listed under its stories file's title also when the stories file writes none (Storybook's automatic title)

  - Fixes "Duplicate stories with id" for a scenario named like one of its stories file's stories.
  - A feature in another folder is listed under its stories file, not under its own path.
  - Story tests show their status in Storybook's UI for these features too.
  - A stories file with no written `title` that no `stories` pattern matches is the feature's link error.

## 1.0.0-beta.1

### Patch Changes

- Storybook: scenario stories are tagged `!manifest`

## 1.0.0-beta.0

### Major Changes

- 1.0: a rewrite. Feature files run as Vitest tests in Node, in a real browser, or as Storybook stories, with one plugin and the same `@cucumber/cucumber` support code. Documentation: https://lotun-io.github.io/vitest-cucumber/

  **Breaking changes**

  - **Requirements**: Node.js 24 or 26 (was 22 or later), Vitest 5 (was 4 or 5), `@cucumber/cucumber` 13.3 or a later 13.x (was 12 or 13).
  - **Options**: `cucumber()` takes `import`, `strict`, `dryRun`, `backtrace`, `language` and `worldParameters`. Every other Cucumber option is ignored, and Cucumber's configuration files and profiles aren't read.
  - **`CUCUMBER_OPTIONS` is no longer read.** Use Vitest's own: `--tagsFilter "@smoke"` for tags, `-t` for names, `test.retry` for retries, `--bail` for fail-fast.
  - **Vitest reports the run.** Cucumber's formatters, plugins and publishing aren't supported.
  - **`setDefaultTimeout` throws**: a step or hook without its own `timeout` has Vitest's `testTimeout` (`hookTimeout` for `BeforeAll` and `AfterAll`). `setParallelCanAssign` throws too (it was a no-op), and `BeforeAll`/`AfterAll` with `on: "COORDINATOR"` aren't supported: use Vitest's `globalSetup`.
  - **`@lotun/vitest-cucumber/browser` is removed** (its `runCucumber`). Browser mode needs only `test.browser`; Storybook has its own preset, below.
  - **`CUCUMBER_WORKER_ID`** is Vitest's pool id, a slot from 1 to `maxWorkers` (it was `VITEST_WORKER_ID`).

  **What 1.0 does**

  - **Every scenario, and every row of a Scenario Outline, is a Vitest test**, in a suite per Feature, Rule and Outline. Run one by its Gherkin line (`cart.feature:12`), by tag or by name.
  - **Gherkin tags are Vitest tags**: `--tagsFilter "@smoke && !@slow"`, and a tag declared in `test.tags` gives its scenarios `retry`, `timeout` or `skip`.
  - **Browser mode runs Cucumber's runtime in the page**: steps, hooks and the World in Chromium, Firefox or WebKit.
  - **Storybook**: with the `@lotun/vitest-cucumber/storybook` preset, a feature file listed in Storybook's `stories` is a stories file of its own, each scenario a story on the stories file next to it (`Login.feature` and `Login.stories.ts`). They play in Vitest with Storybook's Vitest addon, in Storybook's UI and its test widget, and in static builds. `story()` gives a step the running story; `featuresOf()` and `onFeaturesChange()` show a stories file's features on its docs page.
  - **Failures at the Gherkin line**: a failing step's error is your own, with a code frame in the feature file. An undefined, pending or ambiguous step fails its test with Cucumber's summary and snippets.
  - **Attachments** (`this.log`, `this.link`, `this.attach`) are the test's Vitest annotations.
  - **Watch mode** reruns what a saved feature file, step definition or imported module concerns, and every feature file when a support file is added or removed.
  - **Markdown feature files** (`.feature.md`).

## 0.5.4

### Patch Changes

- 19d960b: Add support for vitest 5

## 0.5.3

### Patch Changes

- 957e3e2: Update @cucumber deps

## 0.5.2

### Patch Changes

- 54be580: Use Cucumber's mergeConfigurations instead of overwriting plugin config with CUCUMBER_OPTIONS

## 0.5.1

### Patch Changes

- 8e12431: Fix importGlobs to load as virtual module

## 0.5.0

### Minor Changes

- 6424706: Export `runCucumber` from `@lotun/vitest-cucumber/browser` — runs a feature file on demand from browser-realm code (e.g. Storybook play functions)

## 0.4.4

### Patch Changes

- d7fcc9c: Replace glob with tinyglobby in node support loading
- d7fcc9c: Browser mode multi-project isolation

## 0.4.3

### Patch Changes

- 4346b26: Simplify browser node bridge
- 6746574: Replace Vitest private onCleanup with public alternative

## 0.4.2

### Patch Changes

- decef0a: Improve Cucumber config parsing - config files, named profiles
- 3b0d33d: Support for Cucumber publish option

## 0.4.1

### Patch Changes

- 2a5d460: Cucumber attachments now surface as Vitest test annotations

## 0.4.0

### Minor Changes

- 0fa659b: Add Vitest browser mode support — step and hook bodies now run in the browser, with @cucumber/cucumber importable there.

## 0.3.0

### Minor Changes

- 282c3ed: BeforeAll / AfterAll hooks now run once per worker instead of once per feature file

## 0.2.10

### Patch Changes

- a9c10ea: Prevent silent skip when a feature file errors with no runnable tests

## 0.2.9

### Patch Changes

- c29e383: Update cucumber dependencies

## 0.2.8

### Patch Changes

- 21d03f3: Skip test when all scenarios are filtered out

## 0.2.7

### Patch Changes

- 237dac0: Enhance status fallback

## 0.2.6

### Patch Changes

- d598613: Enhance error stack frames

## 0.2.5

### Patch Changes

- dee7ff3: Add support for @cucumber/cucumber v13.x

## 0.2.4

### Patch Changes

- 74bc9e2: remove @cucumber/gherkin from deps

## 0.2.3

### Patch Changes

- d97d372: Add support for running specific feature files and scenarios

## 0.2.2

### Patch Changes

- 5083ca0: Improve status handling

## 0.2.1

### Patch Changes

- 4683257: Scenarios with no steps are now skipped instead of hanging the test suite.

## 0.2.0

### Minor Changes

- 59f2ca1: Vitest test order now matches Cucumber's execution order

## 0.1.10

### Patch Changes

- a6f1ee7: Retry support - scenarios retried via Cucumber's retry option now correctly report the final attempt's result.

## 0.1.9

### Patch Changes

- 06409bd: Scenarios now run as concurrent Vitest tests, streaming results in real-time as each scenario completes.

## 0.1.8

### Patch Changes

- 26d8dff: Fix double diff output in createError

## 0.1.7

### Patch Changes

- 8af28aa: Enhance error handling

## 0.1.6

### Patch Changes

- c0fa71e: Enhance README with examples

## 0.1.5

### Patch Changes

- 2542b1f: Add readme to package.json files

## 0.1.4

### Patch Changes

- 1d624e2: Add example folder

## 0.1.3

### Patch Changes

- f04ebba: Update package exports

## 0.1.2

### Patch Changes

- 0990f52: Update readme

## 0.1.1

### Patch Changes

- 27ebc2e: Initial release
