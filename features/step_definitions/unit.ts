import { Given } from "@cucumber/cucumber";

Given("a failing step", function failingStep() {
  throw new Error("intentional failure");
});

Given("a step that passes on retry", function passingOnRetry() {
  if (!process.env.RETRY_STEP_ATTEMPTED) {
    process.env.RETRY_STEP_ATTEMPTED = "1";
    throw new Error("first attempt fails");
  }
  delete process.env.RETRY_STEP_ATTEMPTED;
});
