import { World, setWorldConstructor } from "@cucumber/cucumber";
import type { StoryContext } from "@storybook/react-vite";

export type WorldParameters = {
  storyContextKey?: string;
};

export class StoryWorld extends World<WorldParameters> {
  ctx!: StoryContext;
}

setWorldConstructor(StoryWorld);
