import { Given } from "@cucumber/cucumber";

// Module-scoped attempt counter: it persists across a scenario's RETRIES (a
// fresh World is built per attempt, so World state can't track this) and resets
// with the realm. The scenario fails the first attempt and passes the retry.
let attempts = 0;

Given("a flaky step that passes on the second attempt", function flaky() {
  attempts += 1;
  if (attempts < 2) {
    throw new Error("Flaky step failed on attempt 1");
  }
});
