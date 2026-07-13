import { Then } from "@cucumber/cucumber";
import { expect } from "storybook/test";
import type { StoryWorld } from "../support/world.ts";

Then(
  "the button should have label {string}",
  async function (this: StoryWorld, label: string) {
    const { canvas } = this.ctx;
    expect(canvas.getByRole("button", { name: label })).toBeInTheDocument();
  },
);
