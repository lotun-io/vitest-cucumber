import type { Meta, StoryObj } from "@storybook/react-vite";

import { fn } from "storybook/test";

import { Header } from "./Header";

// The stories file of `Header.feature`, next to it: each of its scenarios runs on the story its story
// step names here (`LoggedIn`, `LoggedOut`), which gives it its `args`; any other story is an
// ordinary one.
const meta = {
  title: "Example/Header",
  component: Header,
  parameters: {
    // More on how to position stories at: https://storybook.js.org/docs/configure/story-layout
    layout: "fullscreen",
  },
  args: {
    onLogin: fn(),
    onLogout: fn(),
    onCreateAccount: fn(),
  },
  tags: ["autodocs"],
} satisfies Meta<typeof Header>;

export default meta;
type Story = StoryObj<typeof meta>;

/** The story of the scenario "Logged in": its `args`, its tags with the scenario's (`auth`, `@smoke`). */
export const LoggedIn: Story = {
  tags: ["auth"],
  args: {
    user: {
      name: "Jane Doe",
    },
  },
};

/** The scenario "Logged out". */
export const LoggedOut: Story = {};

/** An ordinary story: no scenario has its name, it renders as any story. */
export const LoggedInWithALongName: Story = {
  args: {
    user: {
      name: "Maximilian Alexander von Habsburg-Lothringen",
    },
  },
};
