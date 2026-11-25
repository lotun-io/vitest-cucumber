import { Given } from "@cucumber/cucumber";
import { expect } from "vitest";

// These steps keep nothing on the World, so they take only what the step gives them.
Given("I render {string}", (markup: string) => {
  document.body.innerHTML = markup;
});

Given("the page should contain the text {string}", (text: string) => {
  expect(document.body.textContent).toContain(text);
});
