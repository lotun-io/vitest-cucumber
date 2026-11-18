import type { StorybookConfig } from "@storybook/react-vite";

// The repo's root features as stories, as a user's: each feature file a stories module of its own
// (its scenarios, on the stories file next to it: `../../features/**/*.stories.ts`, a meta mostly).
const config: StorybookConfig = {
  stories: ["../../features/**/*.feature"],
  addons: ["@storybook/addon-vitest", "@lotun/vitest-cucumber/storybook"],
  framework: "@storybook/react-vite",
};

export default config;
