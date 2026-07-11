import { Given } from "@cucumber/cucumber";
import { expect } from "storybook/test";
import type { StoryWorld } from "../support/world.ts";

Given(
  "I click increment {int} time(s)",
  async function (this: StoryWorld, times: number) {
    const { canvas, userEvent } = this.ctx;
    const btn = canvas.getByRole("button", { name: "increment" });
    for (let i = 0; i < times; i++) {
      await userEvent.click(btn);
    }
  },
);

Given("I click reset", async function (this: StoryWorld) {
  const { canvas, userEvent } = this.ctx;
  await userEvent.click(canvas.getByRole("button", { name: "reset" }));
});

Given(
  "the count should be {int}",
  async function (this: StoryWorld, expected: number) {
    const { canvas } = this.ctx;
    const count = canvas.getByTestId("count");
    expect(count).toHaveTextContent(String(expected));
  },
);
