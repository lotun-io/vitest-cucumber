import type { Meta, StoryObj } from "@storybook/react-vite";
import { cucumberStory } from "../utils/cucumber.ts";
import { Counter } from "./Counter.tsx";

const { play } = cucumberStory();

const meta: Meta<typeof Counter> = {
  component: Counter,
  tags: ["test"],
};
export default meta;

type Story = StoryObj<typeof Counter>;

export const Default: Story = {
  args: {
    initialValue: 0,
    step: 1,
  },
};

export const StartAtTen: Story = {
  args: {
    initialValue: 10,
    step: 1,
  },
};

export const IncrementThreeTimes: Story = {
  name: "Increment three times",
  args: { initialValue: 0, step: 1 },
  play,
};

export const ResetAfterIncrement: Story = {
  name: "Reset after increment",
  args: { initialValue: 0, step: 1 },
  play,
};
