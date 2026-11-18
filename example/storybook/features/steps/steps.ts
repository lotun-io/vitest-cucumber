// The story is already rendered by Storybook (unless unmounted: a step mounts it): steps drive it
// through its context.
import { Then, When } from "@cucumber/cucumber";
import { createElement } from "react";
import { expect, type Mock } from "storybook/test";
import type { StoryWorld } from "../support/world.ts";

// An unmounted story's mount: its component with a label of the scenario's (React's `mount` renders
// the element it's given instead of the story).
When("I mount it with the label {string}", async function (this: StoryWorld, label: string) {
  const { mount, component, args } = this.story;
  if (!component) {
    throw new Error("The story has no component to mount");
  }
  await mount(createElement(component, { ...args, label }));
});

When("I click the {string} button", async function (this: StoryWorld, name: string) {
  const { canvas, userEvent } = this.story;
  this.log(`clicking "${name}"`);
  await userEvent.click(canvas.getByRole("button", { name }));
});

Then("I see the {string} button", async function (this: StoryWorld, name: string) {
  await expect(this.story.canvas.getByRole("button", { name })).toBeInTheDocument();
});

Then("I see the text {string}", async function (this: StoryWorld, text: string) {
  await expect(await this.story.canvas.findByText(text, { exact: false })).toBeInTheDocument();
});

When("I click the button", async function (this: StoryWorld) {
  const { canvas, userEvent } = this.story;
  await userEvent.click(canvas.getByRole("button"));
});

When("I click the button {int} times", async function (this: StoryWorld, times: number) {
  const { canvas, userEvent } = this.story;
  for (let click = 0; click < times; click += 1) {
    await userEvent.click(canvas.getByRole("button"));
  }
});

Then("the button is {word}",async function (this: StoryWorld, look: string) {
  await expect(this.story.canvas.getByRole("button")).toHaveClass(`storybook-button--${look}`);
});

Then("its click handler was called", async function (this: StoryWorld) {
  await expect(this.story.args.onClick).toHaveBeenCalled();
});

Then("its click handler was called {int} times", async function (this: StoryWorld, times: number) {
  await expect(this.story.args.onClick).toHaveBeenCalledTimes(times);
});

Then("its {string} handler was called",async function (this: StoryWorld, handler: string) {
  await expect(this.story.args[handler] as Mock).toHaveBeenCalled();
});
