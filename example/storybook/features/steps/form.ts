// The form's steps (`src/stories/Form.feature`): a data table, a doc string, a parameter type.
import { type DataTable, defineParameterType, Then, When } from "@cucumber/cucumber";
import { expect } from "storybook/test";
import type { StoryWorld } from "../support/world.ts";

// `{role}`: one of the form's roles, as written.
defineParameterType({ name: "role", regexp: /viewer|editor|admin/ });

When("I fill in the form with:", async function (this: StoryWorld, table: DataTable) {
  const { canvas, userEvent } = this.story;
  for (const [label, value] of Object.entries(table.rowsHash())) {
    await userEvent.type(canvas.getByLabelText(label), value);
  }
});

When("I write the notes:", async function (this: StoryWorld, notes: string) {
  const { canvas, userEvent } = this.story;
  await userEvent.type(canvas.getByLabelText("Notes"), notes);
});

When("I choose the {role} role", async function (this: StoryWorld, role: string) {
  const { canvas, userEvent } = this.story;
  await userEvent.selectOptions(canvas.getByLabelText("Role"), role);
});

When("I submit the form", async function (this: StoryWorld) {
  const { canvas, userEvent } = this.story;
  await userEvent.click(canvas.getByRole("button", { name: "Submit" }));
});

Then("the form was submitted with:", async function (this: StoryWorld, table: DataTable) {
  await expect(this.story.args.onSubmit).toHaveBeenCalledWith(
    expect.objectContaining(table.rowsHash()),
  );
});
