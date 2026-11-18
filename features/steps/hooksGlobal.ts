// The hooks `../hooksGlobal.feature` shows. They run in every worker (no tags): a BeforeAll hook
// before its first scenario. And a failing BeforeAll and AfterAll hook, in the workers of
// `../fail/beforeAll.feature` and `../fail/afterAll.feature`: by their feature file (a BeforeAll
// runs before any step).
import { AfterAll, BeforeAll } from "@cucumber/cucumber";
import { expect } from "vitest";

/** Whether this worker runs `../fail/<name>`. */
const runs = (name: string) =>
  expect.getState().testPath?.endsWith(`/features/fail/${name}`) ?? false;

BeforeAll(() => {
  if (runs("beforeAll.feature")) {
    throw new AggregateError(
      [new Error("Error 1"), new Error("Error 2")],
      "BeforeAll hook failed on purpose",
    );
  }
});

AfterAll(() => {
  if (runs("afterAll.feature")) {
    throw Object.assign(
      new Error("AfterAll hook failed on purpose", {
        cause: new Error("the cleanup's own cause"),
      }),
      { code: "E_CLEANUP" },
    );
  }
});
