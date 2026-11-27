import { cucumber } from "@lotun/vitest-cucumber/storybook/node";
import type { StorybookConfig } from "@storybook/react-vite";

const config: StorybookConfig = {
  // Feature files are stories files of their own: each scenario a story on the stories file its
  // Background names (`Given the stories of "./Button.stories.ts"`; from another folder:
  // `features/header/Session.feature`).
  stories: [
    "../src/**/*.mdx",
    "../src/**/*.stories.@(js|jsx|mjs|ts|tsx)",
    "../@(src|features)/**/*.@(feature|feature.md)",
  ],
  addons: [
    "@chromatic-com/storybook",
    "@storybook/addon-vitest",
    "@storybook/addon-a11y",
    "@storybook/addon-docs",
    "@storybook/addon-mcp",
    // Feature files as stories, with the plugin's options (for Storybook and its story tests):
    // `import` lists the support code.
    cucumber({ import: ["features/**/*.ts"] }),
  ],
  framework: "@storybook/react-vite",
};
export default config;
