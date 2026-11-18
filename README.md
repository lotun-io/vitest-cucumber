# @lotun/vitest-cucumber

Run [Cucumber](https://cucumber.io/) feature files as [Vitest](https://vitest.dev/) tests: in Node, in a real browser, or as [Storybook](https://storybook.js.org/) stories.

You write Gherkin and step definitions with `@cucumber/cucumber`'s API. Every scenario, and every row of a Scenario Outline, is a Vitest test: Vitest finds, filters, retries, runs and reports them, and your steps run with Cucumber's semantics (step matching, hooks, World, timeouts, statuses).

**Documentation: https://lotun-io.github.io/vitest-cucumber/**

## Install

```bash
npm install -D @lotun/vitest-cucumber @cucumber/cucumber vitest
```

Requires Node.js 24 or 26, Vitest 5 and `@cucumber/cucumber` 13.3 or a later 13.x. The package is ESM only: your Vitest config must load as an ES module (`"type": "module"` in the nearest `package.json`, or a `vitest.config.mts`).

Then [Getting started](https://lotun-io.github.io/vitest-cucumber/getting-started): the config, a first feature and its steps.

## Modes

- **[Node mode](https://lotun-io.github.io/vitest-cucumber/modes/node)**: steps run in Vitest's workers. For logic, APIs, or driving a browser yourself with Playwright.
- **[Browser mode](https://lotun-io.github.io/vitest-cucumber/modes/browser)**: enable Vitest's [browser mode](https://vitest.dev/guide/browser/) (`test.browser`, with `@vitest/browser-playwright`), and the same steps run in a real page, where they can use the DOM.
- **[Storybook](https://lotun-io.github.io/vitest-cucumber/modes/storybook)**: feature files listed in Storybook's `stories` are stories files of their own, each scenario a story on the stories file next to it (`Login.feature` and `Login.stories.ts`), on the story its step names (`Given the LogIn story`). They play in Vitest with Storybook's Vitest addon, in Storybook's UI and in static builds. Every framework the Vitest addon supports (Storybook's Vite frameworks: React, Next.js, Vue, Svelte, SvelteKit, Angular, Preact, Solid, Web Components, HTML, …).

## License

MIT
