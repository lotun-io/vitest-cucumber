import { Given, Then, When } from "@cucumber/cucumber";
import { expect } from "vitest";
import type { ArithmeticWorld } from "../support/world.ts";

Given("a value of {int}", function valueOf(this: ArithmeticWorld, n: number) {
  this.value = n;
});

When("I double it", function double(this: ArithmeticWorld) {
  this.value *= 2;
});

When("I add {int}", function add(this: ArithmeticWorld, n: number) {
  this.value += n;
});

Then(
  "the value should be {int}",
  function shouldBe(this: ArithmeticWorld, expected: number) {
    expect(this.value).toBe(expected);
  },
);
