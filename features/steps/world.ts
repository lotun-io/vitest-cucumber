import { Then, world } from "@cucumber/cucumber";
import { expect } from "vitest";
import { TestWorld } from "../support/world.ts";

Then("the world should reflect like a real World", () => {
  // The `world` proxy forwards every trap, so prototype- and key-based
  // reflection sees the real World instance, matching native Cucumber.
  expect(world instanceof TestWorld).toBe(true);
  expect(Object.keys(world)).toContain("value");
  expect({ ...(world as object) }).toMatchObject({ value: 5 });
});
