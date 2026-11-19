import type { Preview } from "@storybook/react-vite";
import { DocsPage } from "./DocsPage";

const preview: Preview = {
  // Every stories file gets a docs page (a feature's scenario stories never do: the plugin tags
  // them `!autodocs`).
  tags: ["autodocs"],
  parameters: {
    docs: {
      // Storybook's docs page, then the stories file's features (`./DocsPage.tsx`).
      page: DocsPage,
    },
  },
};

export default preview;
