import { Given } from "@cucumber/cucumber";

Given("a failing step", function failingStep() {
  throw new Error("Step failed intentionally");
});
