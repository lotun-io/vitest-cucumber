# @lotun/vitest-cucumber

A [Vitest](https://vitest.dev/) plugin that lets you run [Cucumber](https://cucumber.io/) `.feature` files as native Vitest tests. Write your scenarios in Gherkin, define step definitions with `@cucumber/cucumber`, and execute them with the full power of Vitest's runner — parallel execution, watch mode, coverage, and clickable error locations in your feature files.

## Features

- **Runs on the official Cucumber API** — uses `@cucumber/cucumber` runtime under the hood, so everything Cucumber supports is supported (Scenarios, Outlines, Backgrounds, Rules, Tags, Hooks, Custom Worlds, etc.)
- **Native Vitest integration** — `.feature` files appear as regular test files in Vitest's output
- **Parallel execution** — leverages Vitest's worker-based parallelism
- **Clickable errors** — failures point to the exact line in the `.feature` file
- **Tag filtering** — use `CUCUMBER_OPTIONS` env var to pass any Cucumber CLI flags (e.g. `--tags`)
- **Line number targeting** — run a specific scenario or outline by appending `:line` to the feature file path (e.g. `vitest run features/simple.feature:5`)

## Requirements

- Node.js >= 22.0.0
- Vitest ^4.x
- @cucumber/cucumber ^12.x || ^13.x

## Installation

```bash
npm install -D @lotun/vitest-cucumber @cucumber/cucumber vitest
```

## Setup

### `vitest.config.ts`

```ts
import { defineConfig } from "vitest/config";
import { cucumber } from "@lotun/vitest-cucumber";

export default defineConfig({
  plugins: [
    cucumber({
      import: ["features/support/**/*.ts", "features/step_definitions/**/*.ts"],
    }),
  ],
  test: {
    include: ["features/**/*.feature"],
  },
});
```

The `cucumber()` plugin accepts an optional partial [`IConfiguration`](https://github.com/cucumber/cucumber-js/blob/main/docs/configuration.md) object — the same options you would pass to Cucumber CLI.

> **Tip:** Setting [`isolate: false`](https://vitest.dev/config/isolate) in Vitest config allows workers to reuse cached support files (step definitions, hooks, world) across feature files, which can significantly speed up test runs with many feature files.

## Usage

### Run tests

```bash
npx vitest run
```

### Run a single feature file

```bash
npx vitest run features/simple.feature
```

### Run by line number

You can target a specific scenario or scenario outline by passing a line number:

```bash
# Run a specific scenario (line where "Scenario:" appears)
# features/simple.feature line 5 → "A single passing step"
npx vitest run features/simple.feature:5
# Run a specific Scenario Outline (line where "Scenario Outline:" appears — runs all its examples)
# features/outline.feature line 3 → "Doubling <input>" (3 examples)
npx vitest run features/outline.feature:3
# Run a single example row of an outline
# features/outline.feature line 10 → "Doubling 3" only
npx vitest run features/outline.feature:10
```

## Environment CLI Options

Use the `CUCUMBER_OPTIONS` environment variable to pass Cucumber CLI options at runtime. These options will overwrite the corresponding values in the config passed to the `cucumber()` plugin.

```bash
CUCUMBER_OPTIONS="--tags @smoke" npx vitest run
```

## How It Works

1. The Vitest plugin intercepts `.feature` files during the `transform` phase
2. Each feature is transformed into a small JS module that calls `runFeatureFile()`
3. The Gherkin source is parsed to extract scenario names and structure
4. Support code (step definitions, hooks, world) is loaded via Vitest's module loader
5. `@cucumber/cucumber`'s runtime executes the scenarios and collects results
6. Results are mapped back to Vitest's `describe`/`test` blocks with pass/fail/skip status

> **Note:** The `CUCUMBER_WORKER_ID` environment variable is automatically set to match the `VITEST_WORKER_ID` environment variable.

## Unsupported Cucumber Options

Some Cucumber options conflict with how Vitest manages test execution and are not supported:

| Option     | Reason                                                               |
| ---------- | -------------------------------------------------------------------- |
| `parallel` | Vitest handles parallelism via workers — use Vitest's config instead |
| `publish` | Cucumber is invoked once per feature file, so each file uploads a separate partial report to `reports.cucumber.io` instead of one unified report |

Passing `parallel` (via plugin config or `CUCUMBER_OPTIONS`) will throw an error at runtime.

## Example

### Feature file

```gherkin
Feature: Arithmetic

  Scenario: Double a value
    Given a value of 3
    When I double it
    Then the value should be 6
```

### World (`features/support/world.ts`)

```ts
import { setWorldConstructor } from "@cucumber/cucumber";

export class ArithmeticWorld {
  value = 0;
}

setWorldConstructor(ArithmeticWorld);
```

### Step definitions (`features/step_definitions/arithmetic.ts`)

```ts
import { Given, Then, When } from "@cucumber/cucumber";
import { expect } from "vitest";
import type { ArithmeticWorld } from "../support/world.ts";

Given("a value of {int}", function valueOf(this: ArithmeticWorld, n: number) {
  this.value = n;
});

When("I double it", function double(this: ArithmeticWorld) {
  this.value *= 2;
});

When("I add {int}", function add(this: ArithmeticWorld, n: number) {
  this.value += n;
});

Then(
  "the value should be {int}",
  function shouldBe(this: ArithmeticWorld, expected: number) {
    expect(this.value).toBe(expected);
  },
);
```

A fully working example project is available in the [`example/`](./example) folder, demonstrating feature files, step definitions, hooks, and a custom world.
