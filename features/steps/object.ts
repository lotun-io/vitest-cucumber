import { Given, Then } from "@cucumber/cucumber";
import { expect } from "vitest";
import type { TestWorld } from "../support/world.ts";

Given(/^object is:$/, function responseContain(this: TestWorld, value) {
  const parsed = JSON.parse(value);
  this.object = parsed;
});

Then(
  /^object should contain:$/,
  function responseContain(this: TestWorld, expectedResponse) {
    const parsedExpectedResponse = JSON.parse(expectedResponse);
    expect(this.object).to.containSubset(parsedExpectedResponse);
  },
);
