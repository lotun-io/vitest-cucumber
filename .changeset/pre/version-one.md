---
"@lotun/vitest-cucumber": major
---

1.0: a rewrite. Feature files run as Vitest tests in Node, in a real browser, or as Storybook stories, with one plugin and the same `@cucumber/cucumber` support code. Documentation: https://lotun-io.github.io/vitest-cucumber/

**Breaking changes**

- **Requirements**: Node.js 24 or later, Vitest 5, `@cucumber/cucumber` 13.
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
