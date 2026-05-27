# @lotun/vitest-cucumber

A [Vitest](https://vitest.dev/) plugin that lets you run [Cucumber](https://cucumber.io/) `.feature` files as native Vitest tests. Write your scenarios in Gherkin, define step definitions with `@cucumber/cucumber`, and execute them with the full power of Vitest's runner — parallel execution, watch mode, coverage, and clickable error locations in your feature files.

## Features

- **Runs on the official Cucumber API** — uses `@cucumber/cucumber` runtime under the hood, so everything Cucumber supports is supported (Scenarios, Outlines, Backgrounds, Rules, Tags, Hooks, Custom Worlds, etc.)
- **Native Vitest integration** — `.feature` files appear as regular test files in Vitest's output
- **Parallel execution** — leverages Vitest's worker-based parallelism
- **Clickable errors** — failures point to the exact line in the `.feature` file
- **Tag filtering** — use `CUCUMBER_OPTIONS` env var to pass any Cucumber CLI flags (e.g. `--tags`)

## Requirements

- Node.js >= 24.0.0
- Vitest 4.x
- @cucumber/cucumber 12.x

## Installation

```bash
pnpm add -D @lotun/vitest-cucumber @cucumber/cucumber vitest
```

## Setup

### `vitest.config.ts`

```ts
import { defineConfig } from "vitest/config";
import { cucumber } from "@lotun/vitest-cucumber";

export default defineConfig({
  test: {
    plugins: [
      cucumber({
        import: [
          "features/support/**/*.ts",
          "features/step_definitions/**/*.ts",
        ],
      }),
    ],
    test: {
      include: ["features/**/*.feature"],
    },
  },
});
```

The `cucumber()` plugin accepts an optional partial [`IConfiguration`](https://github.com/cucumber/cucumber-js/blob/main/docs/configuration.md) object — the same options you would pass to Cucumber CLI.

## Usage

### 4. Run tests

```bash
pnpm vitest run
```

## Tag Filtering

Pass Cucumber CLI options via the `CUCUMBER_OPTIONS` environment variable:

```bash
CUCUMBER_OPTIONS="--tags @smoke" pnpm vitest run
```

## How It Works

1. The Vitest plugin intercepts `.feature` files during the `transform` phase
2. Each feature is transformed into a small JS module that calls `runFeatureFile()`
3. The Gherkin source is parsed to extract scenario names and structure
4. Support code (step definitions, hooks, world) is loaded via Vitest's module loader
5. `@cucumber/cucumber`'s runtime executes the scenarios and collects results
6. Results are mapped back to Vitest's `describe`/`test` blocks with pass/fail/skip status
