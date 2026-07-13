import type { Meta, StoryObj } from "@storybook/react-vite";
import { cucumberPlay } from "../utils/cucumber.ts";
import { Button } from "./Button.tsx";

const meta: Meta<typeof Button> = {
  component: Button,
  tags: ["test"],
  argTypes: {
    variant: { control: "radio", options: ["primary", "secondary"] },
    size: { control: "radio", options: ["sm", "md", "lg"] },
    onClick: { action: "clicked" },
  },
};
export default meta;

type Story = StoryObj<typeof Button>;

export const Primary: Story = {
  args: {
    label: "Click me",
    variant: "primary",
    size: "md",
  },
  play: cucumberPlay(),
};

export const Secondary: Story = {
  args: {
    label: "Click me",
    variant: "secondary",
    size: "md",
  },
};

export const Large: Story = {
  args: {
    label: "Large button",
    variant: "primary",
    size: "lg",
  },
  play: cucumberPlay(),
};

export const Disabled: Story = {
  args: {
    label: "Disabled",
    variant: "primary",
    disabled: true,
  },
};
