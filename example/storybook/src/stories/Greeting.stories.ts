import type { Meta, StoryObj } from "@storybook/react-vite";

import { fn } from "storybook/test";

import { Greeting } from "./Greeting";

// The stories file of `Greeting.feature`, next to it: a scenario runs on the story its story step
// names here (`Ada`, `Grace`), which gives it its `args`; one that names none runs on the meta.
const meta = {
  title: "Example/Greeting",
  component: Greeting,
  args: {
    name: "World",
    onGreet: fn(),
  },
  tags: ["autodocs"],
} satisfies Meta<typeof Greeting>;

export default meta;
type Story = StoryObj<typeof meta>;

/** The story of "Saying hello" and of the Outline's first row: its tags with the scenario's (`people`, `@smoke`). */
export const Ada: Story = {
  tags: ["people"],
  args: { name: "Ada" },
};

/** The story of the Outline's second row. */
export const Grace: Story = {
  args: { name: "Grace" },
};
