import type { StoryContext } from "@storybook/react-vite";
import type {
  StoryWorld,
  WorldParameters,
} from "../../features/support/world.ts";

// eslint-disable-next-line
const isVitest = (import.meta as any).env?.VITEST_STORYBOOK;

const storyContextRegistry = new Map<string, StoryContext>();

if (isVitest) {
  const { Before } = await import("@cucumber/cucumber");
  Before(function (this: StoryWorld) {
    const key = this.parameters.storyContextKey ?? "";
    const ctx = storyContextRegistry.get(key);
    storyContextRegistry.delete(key);
    if (ctx) {
      this.ctx = ctx;
    }
  });
}

export const cucumberPlay = (
  options: { featurePath?: string; scenarioName?: string } = {},
) => {
  let { featurePath } = options;
  if (!featurePath) {
    const storyUrl = new Error().stack
      ?.split("\n")
      .find((l) => l.includes(".stories.ts"))
      ?.match(/https?:\/\/.+/)
      ?.at(0);

    if (!storyUrl) {
      throw new Error(
        "Could not determine the story URL from the stack trace. Please provide a featurePath in the options.",
      );
    }

    const pathname = new URL(storyUrl).pathname;
    featurePath = pathname.replace(/\.[^.]+$/, ".feature");
  }

  return async (ctx: StoryContext<any>) => {
    if (!isVitest) {
      return;
    }

    const { runCucumber } = await import("@lotun/vitest-cucumber/browser");
    const scenarioName = options.scenarioName ?? ctx.name;
    const key = crypto.randomUUID();
    storyContextRegistry.set(key, ctx);

    const { results } = await runCucumber({
      id: featurePath,
      config: {
        name: [`^${RegExp.escape(scenarioName)}$`],
        worldParameters: { storyContextKey: key } satisfies WorldParameters,
      },
    });

    if (results.length === 0) {
      throw new Error(
        `Scenario "${scenarioName}" is missing in feature file "${featurePath}".`,
      );
    }

    const failedResult = results.find((result) => result.error);

    if (failedResult) {
      throw failedResult.error;
    }
  };
};
