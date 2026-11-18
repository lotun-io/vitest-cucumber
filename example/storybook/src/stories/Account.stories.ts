import type { Meta } from "@storybook/react-vite";
import { Page } from "./Page";

// The stories file of `Account.feature.md` (a Markdown feature), next to it: its meta is each
// scenario's and Outline row's story.
const meta = {
  title: "Example/Account",
  component: Page,
  parameters: { layout: "fullscreen" },
} satisfies Meta<typeof Page>;

export default meta;
