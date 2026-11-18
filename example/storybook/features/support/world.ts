import { setWorldConstructor, World } from "@cucumber/cucumber";
import { story } from "@lotun/vitest-cucumber/storybook";
import type { StoryContext } from "@storybook/react-vite";

/** The World of story-driven scenarios: `this.story` is the running story's context. */
export class StoryWorld extends World {
  get story() {
    return story<StoryContext>();
  }
}

setWorldConstructor(StoryWorld);
