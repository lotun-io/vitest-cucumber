import { Given, Then } from "@cucumber/cucumber";
import { expect } from "vitest";
import { ArithmeticWorld } from "../support/world.ts";

Given(/^object is:$/, function responseContain(this: ArithmeticWorld, value) {
  const parsed = JSON.parse(value);
  this.object = parsed;
});

Then(
  /^object should contain:$/,
  function responseContain(this: ArithmeticWorld, expectedResponse) {
    const parsedExpectedResponse = JSON.parse(expectedResponse);
    expect(this.object).to.containSubset(parsedExpectedResponse);
  },
);
