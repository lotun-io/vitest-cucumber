import { Given, When, Then } from "@cucumber/cucumber";
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
    if (this.value !== expected) {
      throw new Error(`Expected ${expected} but got ${this.value}`);
    }
  },
);

Given("a failing step", function failingStep() {
  // eslint-disable-next-line config-thefork/throw-thefork-error
  throw new Error("intentional failure");
});
