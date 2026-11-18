// The definitions `../summaries.feature` needs: an ambiguous step, pending steps, steps whose
// parameter types aren't defined, and failing hooks (tagged: that feature's only).
import { After, Before, Given } from "@cucumber/cucumber";
import type { TestWorld } from "../support/world.ts";

Given(/^an ambiguous summary step$/, () => {});
Given(/^an ambiguous (summary) step$/, () => {});

Given("a pending summary step", () => "pending");

Given(
  "a pending summary step with an attachment",
  async function attached(this: TestWorld) {
    await this.attach("some text", "text/plain");
    this.log("a log line");
    return "pending";
  },
);

// No `flavor`, `topping`, `size` or `container` parameter type: cucumber leaves these out (their
// steps are undefined) and names each one's first missing type.
Given("a {flavor} flavor", () => {});
Given("a {topping} topping on {int} {flavor} scoop(s)", () => {});
Given("a {size} cup of {fruit} juice", () => {});
Given("a {container} of {flavor} to go", () => {});

Before({ tags: "@summaryFailBefore" }, () => {
  throw new Error("Before hook failed on purpose");
});

After({ tags: "@summaryFailAfter" }, () => {
  throw new Error("After hook failed on purpose");
});
