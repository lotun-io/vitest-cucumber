import type { IConfiguration } from "@cucumber/cucumber";
import { createError } from "../utils/createError.ts";
import { ensureCache, run } from "./runner.ts";

export type RunCucumberOptions = {
  id: string;
  config?: Pick<
    Partial<IConfiguration>,
    "name" | "dryRun" | "retry" | "worldParameters"
  >;
};

export const runCucumber = async ({ id, config }: RunCucumberOptions) => {
  const { isCached } = await ensureCache();

  const withHook = isCached ? "none" : "before";

  const { results, featureName } = await run({
    id,
    dispatchTestCaseFinished: true,
    withHook,
    provided: config,
  });

  return {
    featureName,
    results: results.map((result) => {
      const status = result.status ?? "FAILED";
      const error = ["PASSED", "SKIPPED"].includes(status)
        ? undefined
        : createError({ id, result });
      return {
        id: result.id,
        status,
        error,
      };
    }),
  };
};
