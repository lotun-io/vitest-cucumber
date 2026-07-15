import type { StoryContext } from "@storybook/react-vite";
import type { StoryWorld } from "../../features/support/world.ts";

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

const getFeaturePath = async ({ storyUrl }: { storyUrl?: string }) => {
  if (!storyUrl) {
    throw new Error("Could not determine the story URL from the stack trace.");
  }

  const { commands } = await import("vitest/browser");

  const pathname = new URL(storyUrl).pathname;
  const storyPath = pathname.replace(/\.[^.]+$/, ".feature");
  const featurePath = storyPath.replace("/src/", "/features/");

  const id =
    (await commands
      .readFile(storyPath)
      .then(() => storyPath)
      .catch(() => null)) ??
    (await commands
      .readFile(featurePath)
      .then(() => featurePath)
      .catch(() => null));

  if (!id) {
    throw new Error(
      `Feature file not found. Tried:\n  ${storyPath}\n  ${featurePath}`,
    );
  }

  return id;
};

export const cucumberPlay = () => {
  const storyUrl = new Error().stack
    ?.split("\n")
    .find((line) => line.includes(".stories.ts"))
    ?.match(/https?:\/\/.+/)
    ?.at(0);

  return async (ctx: StoryContext<any>) => {
    if (!isVitest) {
      return;
    }

    const { runCucumber } = await import("@lotun/vitest-cucumber/browser");
    const featurePath = await getFeaturePath({ storyUrl });
    const scenarioName = ctx.name;
    const key = crypto.randomUUID();
    storyContextRegistry.set(key, ctx);

    const { results } = await runCucumber({
      id: featurePath,
      config: {
        name: [`^${RegExp.escape(scenarioName)}$`],
        worldParameters: { storyContextKey: key },
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
