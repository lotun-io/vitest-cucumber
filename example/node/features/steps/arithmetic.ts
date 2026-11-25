import { Given } from "@cucumber/cucumber";
import { expect } from "vitest";
import type { ArithmeticWorld } from "../support/world.ts";

// Arrow functions: the scenario's World is the first argument, named `world`.
Given("a value of {int}", (world: ArithmeticWorld, n: number) => {
  world.value = n;
});

Given("I double it", (world: ArithmeticWorld) => {
  world.value *= 2;
});

Given("I add {int}", (world: ArithmeticWorld, n: number) => {
  world.value += n;
});

Given(
  "the value should be {int}",
  (world: ArithmeticWorld, expected: number) => {
    expect(world.value).toBe(expected);
  },
);
