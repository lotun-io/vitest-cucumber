# <img src="https://raw.githubusercontent.com/lotun-io/vitest-cucumber/main/docs/app/icon.svg" alt="" width="42" height="42" align="absmiddle"> @lotun/vitest-cucumber

Run [Cucumber](https://cucumber.io/) feature files as [Vitest](https://vitest.dev/) tests.

[![npm version](https://img.shields.io/npm/v/@lotun/vitest-cucumber/beta)](https://www.npmjs.com/package/@lotun/vitest-cucumber/v/beta)

[Documentation](https://lotun-io.github.io/vitest-cucumber/) | [Getting Started](https://lotun-io.github.io/vitest-cucumber/getting-started) | [Examples](https://lotun-io.github.io/vitest-cucumber/examples) | [Discord](https://discord.gg/dfJUkmEtAP) | [Discussions](https://github.com/lotun-io/vitest-cucumber/discussions)

## Install

```bash
npm install -D @lotun/vitest-cucumber@beta @cucumber/cucumber vitest
```

> Requires Node.js 24, or 26 and later, Vitest 5 and [`@cucumber/cucumber`](https://github.com/cucumber/cucumber-js) 13.

## Modes

- [Node mode](https://lotun-io.github.io/vitest-cucumber/modes/node): steps run in Vitest's workers. For logic, APIs, or driving a browser with Playwright.
- [Browser mode](https://lotun-io.github.io/vitest-cucumber/modes/browser): the same steps run in a real page, with Vitest's browser mode.
- [Storybook](https://lotun-io.github.io/vitest-cucumber/modes/storybook): each scenario is a story on the stories file its feature names (`Given the stories of "./Login.stories.ts"`).

## Features

- [Uses the official `@cucumber/cucumber` package](https://lotun-io.github.io/vitest-cucumber/guides/support-code#what-works): your steps, hooks and World import from it, with Cucumber's API unchanged
- [Every scenario, and every row of a Scenario Outline, is a Vitest test](https://lotun-io.github.io/vitest-cucumber/guides/running#how-scenarios-become-tests)
- [Scenarios as Storybook stories](https://lotun-io.github.io/vitest-cucumber/modes/storybook): played in Vitest, in Storybook's UI and in static builds, with [a stories file's features on its docs page](https://lotun-io.github.io/vitest-cucumber/guides/storybook/docs)
- [Cucumber runs inside the browser page](https://lotun-io.github.io/vitest-cucumber/modes/browser): your steps, hooks and World in Chromium, Firefox or WebKit, with Vitest's browser mode
- [Run one scenario by its Gherkin line, by tag or by name](https://lotun-io.github.io/vitest-cucumber/guides/running#filtering)
- [Failures at the step's line in the feature file](https://lotun-io.github.io/vitest-cucumber/guides/results#a-failing-step), and [Cucumber's snippets for undefined steps](https://lotun-io.github.io/vitest-cucumber/guides/results#undefined-pending-and-ambiguous-steps)
- Vitest's [watch mode](https://lotun-io.github.io/vitest-cucumber/guides/running#watch-mode), [parallel runs](https://lotun-io.github.io/vitest-cucumber/guides/running#parallel-runs), [retries](https://lotun-io.github.io/vitest-cucumber/guides/running#retries), [coverage](https://lotun-io.github.io/vitest-cucumber/guides/running#coverage) and reporters

## Example

```ts
// vitest.config.ts
import { cucumber } from "@lotun/vitest-cucumber";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [cucumber({ import: ["features/**/*.ts"] })],
  test: { include: ["features/**/*.feature"] },
});
```

```gherkin
# features/greeting.feature
Feature: Greeting

  Scenario: Saying hello
    Given a visitor named "Ada"
    When they are greeted
    Then the greeting is "Hello, Ada!"
```

```ts
// features/steps/greeting.ts
import { Given, type IWorld, Then, When } from "@cucumber/cucumber";
import { expect } from "vitest";

Given("a visitor named {string}", (world: IWorld, name: string) => {
  world.name = name;
});

When("they are greeted", (world: IWorld) => {
  world.greeting = `Hello, ${world.name}!`;
});

Then("the greeting is {string}", (world: IWorld, text: string) => {
  expect(world.greeting).toBe(text);
});
```

In a TypeScript project, name the plugin's types in your `tsconfig.json`, so Cucumber's hooks are
typed for a `world` argument too:

```json
{ "compilerOptions": { "types": ["@lotun/vitest-cucumber"] } }
```

```bash
$ npx vitest
```

## License

MIT
