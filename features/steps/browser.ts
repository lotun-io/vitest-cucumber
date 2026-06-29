import { Given, Then, When } from "@cucumber/cucumber";
import { expect } from "vitest";
import { TestWorld } from "../support/world.ts";

Given("a counter widget is rendered", function counter(this: TestWorld) {
  this.value = 0;
  // @ts-expect-error — DOM runs in the page; no DOM lib in tsconfig.
  document.body.innerHTML =
    '<button type="button">Increment</button><output>0</output>';
  // @ts-expect-error
  const output = document.querySelector("output");
  // @ts-expect-error
  document.querySelector("button").addEventListener("click", () => {
    this.value += 1;
    output.textContent = String(this.value);
  });
});

When("I click the {string} button", async function click(label: string) {
  const { page, userEvent } = await import("vitest/browser");
  await userEvent.click(page.getByRole("button", { name: label }));
});

Then("the count should be {int}", async function count(expected: number) {
  const { page } = await import("vitest/browser");
  await expect
    .element(page.getByRole("status"))
    .toHaveTextContent(String(expected));
});
