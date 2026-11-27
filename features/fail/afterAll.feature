Feature: A failing AfterAll hook
  Its worker's AfterAll hook fails (see `../steps/hooksGlobal.ts`: in this feature file's worker):
  the scenario passes, the run fails with the hook's error at the worker's end. Left out (see
  `vitest.config.ts`) unless the command names `features/fail/`:

  pnpm test --project node features/fail/afterAll.feature

  Background:
    Given the stories of "src/Empty.stories.ts"
    And the "default" story

  Scenario: Passing, its worker's AfterAll hook fails
    Given a value of 1
    Then the value should be 1
