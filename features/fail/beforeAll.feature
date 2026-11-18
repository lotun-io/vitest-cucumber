Feature: A failing BeforeAll hook
  Its worker's BeforeAll hook fails (see `../steps/hooksGlobal.ts`: it runs before any step, so
  it fails in this feature file's worker): the worker's scenarios are skipped, the run fails with
  the hook's error. Left out (see `vitest.config.ts`) unless the command names
  `features/fail/`:

  pnpm test --project node features/fail/beforeAll.feature

  Scenario: Skipped, its worker's BeforeAll hook failed
    Given a value of 1
    Then the value should be 1
