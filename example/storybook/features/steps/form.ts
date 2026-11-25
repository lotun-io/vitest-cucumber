// The form's steps (`src/stories/Form.feature`): a data table, a doc string, a parameter type.
import { type DataTable, defineParameterType, Then, When } from "@cucumber/cucumber";
import { expect } from "storybook/test";
import type { StoryWorld } from "../support/world.ts";

// `{role}`: one of the form's roles, as written.
defineParameterType({ name: "role", regexp: /viewer|editor|admin/ });

When("I fill in the form with:", async (world: StoryWorld, table: DataTable) => {
  const { canvas, userEvent } = world.story;
  for (const [label, value] of Object.entries(table.rowsHash())) {
    await userEvent.type(canvas.getByLabelText(label), value);
  }
});

When("I write the notes:", async (world: StoryWorld, notes: string) => {
  const { canvas, userEvent } = world.story;
  await userEvent.type(canvas.getByLabelText("Notes"), notes);
});

When("I choose the {role} role", async (world: StoryWorld, role: string) => {
  const { canvas, userEvent } = world.story;
  await userEvent.selectOptions(canvas.getByLabelText("Role"), role);
});

When("I submit the form", async (world: StoryWorld) => {
  const { canvas, userEvent } = world.story;
  await userEvent.click(canvas.getByRole("button", { name: "Submit" }));
});

Then("the form was submitted with:", async (world: StoryWorld, table: DataTable) => {
  await expect(world.story.args.onSubmit).toHaveBeenCalledWith(
    expect.objectContaining(table.rowsHash()),
  );
});
