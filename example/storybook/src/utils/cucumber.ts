import type { StoryContext, StoryObj } from "@storybook/react-vite";
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
    const key = this.parameters.storyContextKey;
    if (key) {
      this.ctx = storyContextRegistry.get(key)!;
      storyContextRegistry.delete(key);
    }
  });
}

export const cucumberStory = ({
  featurePath,
}: { featurePath?: string } = {}) => {
  if (!featurePath) {
    const callerLine = new Error().stack
      ?.split("\n")
      .find((l) => l.includes(".stories.tsx"));
    const name = callerLine?.match(/\/([^/?]+)\.stories\.tsx/)?.[1];
    featurePath = `features/${name}.stories.feature`;
  }

  const play: NonNullable<StoryObj["play"]> = async (ctx) => {
    if (!isVitest) {
      return;
    }

    const { runCucumber } = await import("../../../../src/browser/index.ts");
    const scenarioName = ctx.name;
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

  return {
    play,
  };
};
