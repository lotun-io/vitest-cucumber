import { Given, Then } from "@cucumber/cucumber";
import { expect } from "vitest";
import type { BrowserWorld } from "../support/world.ts";

Given("I render {string}", function render(this: BrowserWorld, markup: string) {
  document.body.innerHTML = markup;
});

Then(
  "the page should contain the text {string}",
  function contains(this: BrowserWorld, text: string) {
    expect(document.body.textContent).toContain(text);
  },
);
