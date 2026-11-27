import { cucumber } from "@lotun/vitest-cucumber/storybook/node";
import type { StorybookConfig } from "@storybook/react-vite";

// The repo's root features as stories, as a user's: each feature file a stories module of its own
// (its scenarios, on the stories file its Background names: `../src/Empty.stories.ts`,
// one for all, a meta only), with the root features' support code,
// as the root's `node` and `browser` projects load it (the Storybook steps among it:
// `../../features/steps/stories.ts`) (the plugin's options, from this package's folder).
const config: StorybookConfig = {
  stories: ["../../features/**/*.feature"],
  addons: [
    "@storybook/addon-vitest",
    cucumber({
      import: ["../features/**/*.ts"],
    }),
  ],
  framework: "@storybook/react-vite",
};

export default config;
