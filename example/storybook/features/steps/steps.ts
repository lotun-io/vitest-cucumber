// The story is already rendered by Storybook (unless unmounted: a step mounts it): steps drive it
// through its context.
import { Then, When } from "@cucumber/cucumber";
import { createElement } from "react";
import { expect, type Mock } from "storybook/test";
import type { StoryWorld } from "../support/world.ts";

// An unmounted story's mount: its component with a label of the scenario's (React's `mount` renders
// the element it's given instead of the story).
When("I mount it with the label {string}", async (world: StoryWorld, label: string) => {
  const { mount, component, args } = world.story;
  if (!component) {
    throw new Error("The story has no component to mount");
  }
  await mount(createElement(component, { ...args, label }));
});

When("I click the {string} button", async (world: StoryWorld, name: string) => {
  const { canvas, userEvent } = world.story;
  world.log(`clicking "${name}"`);
  await userEvent.click(canvas.getByRole("button", { name }));
});

Then("I see the {string} button", async (world: StoryWorld, name: string) => {
  await expect(world.story.canvas.getByRole("button", { name })).toBeInTheDocument();
});

Then("I see the text {string}", async (world: StoryWorld, text: string) => {
  await expect(await world.story.canvas.findByText(text, { exact: false })).toBeInTheDocument();
});

When("I click the button", async (world: StoryWorld) => {
  const { canvas, userEvent } = world.story;
  await userEvent.click(canvas.getByRole("button"));
});

When("I click the button {int} times", async (world: StoryWorld, times: number) => {
  const { canvas, userEvent } = world.story;
  for (let click = 0; click < times; click += 1) {
    await userEvent.click(canvas.getByRole("button"));
  }
});

Then("the button is {word}",async (world: StoryWorld, look: string) => {
  await expect(world.story.canvas.getByRole("button")).toHaveClass(`storybook-button--${look}`);
});

Then("its click handler was called", async (world: StoryWorld) => {
  await expect(world.story.args.onClick).toHaveBeenCalled();
});

Then("its click handler was called {int} times", async (world: StoryWorld, times: number) => {
  await expect(world.story.args.onClick).toHaveBeenCalledTimes(times);
});

Then("its {string} handler was called",async (world: StoryWorld, handler: string) => {
  await expect(world.story.args[handler] as Mock).toHaveBeenCalled();
});
