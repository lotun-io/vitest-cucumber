// The runner of story tests (the addon's), the page's (`./annotation.ts`). A story's target runs in
// the story's test, Vitest's running one (`TestRunner.getCurrentTest()`): its attachments the test's
// annotations, its skip the test's. BeforeAll and AfterAll aren't Storybook's here: the worker fixture
// runs them, as for feature files (`./tests.ts`), so the runner has none for the project's `beforeAll`.
import { TestRunner } from "vitest";
import type { PageRunner } from "../../../types/storybook.ts";
import { pluginError } from "../../../utils/errors.ts";
import { runScenarioTest } from "../../platform/scenario/scenarioTest.ts";
import { platform } from "./platform.ts";

export const runner: PageRunner = {
  run: async (scenario) => {
    // Always in a story test: the test Vitest is running.
    const task = TestRunner.getCurrentTest();
    if (!task) {
      throw pluginError("a story played outside its test", { internal: true });
    }
    await runScenarioTest(platform, scenario, task, task.context);
  },
};
