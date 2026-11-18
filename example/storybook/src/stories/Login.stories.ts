import type { Meta } from "@storybook/react-vite";
import { Page } from "./Page";

// The stories file of `Login.feature`, next to it: its meta is each scenario's and Outline row's
// story (none names a story).
const meta = {
  title: "Example/Login",
  component: Page,
  parameters: { layout: "fullscreen" },
} satisfies Meta<typeof Page>;

export default meta;
