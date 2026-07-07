import {
  Given,
  setParallelCanAssign,
  Then,
  version,
  wrapPromiseWithTimeout,
} from "@cucumber/cucumber";
import { expect } from "vitest";
import { lifecycle, wrapped } from "../support/hooks.ts";
import { Point } from "../support/parameterTypes.ts";
import type { TestWorld } from "../support/world.ts";

// 32×32 solid blue PNG (base64) — stands in for a screenshot; visible in the UI.
const PNG =
  "iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAIAAAD8GO2jAAAAKklEQVR42u3NQQkAAAgEsKtiaYtawBQ+hMH+S/WcikAgEAgEAoFAIPgSLKFXqFspoaczAAAAAElFTkSuQmCC";

Then(
  "the point should be {point}",
  function checkPoint(this: TestWorld, point: Point) {
    // A non-serializable class instance produced by the custom parameter type
    // (round-tripped via a value-handle in browser mode).
    expect(point).toBeInstanceOf(Point);
    expect(point.x).toBe(1);
    expect(point.y).toBe(2);
  },
);

Then("a slow action times out", async () => {
  await expect(
    wrapPromiseWithTimeout(new Promise(() => undefined), 10),
  ).rejects.toThrow("Action did not complete within 10 milliseconds");
});

Then("the cucumber version is reported", () => {
  expect(version).toMatch(/^\d+\.\d+\.\d+/);
});

// setDefinitionFunctionWrapper wraps every step body, so by the time this step
// runs the wrapper has fired at least once (this step is itself wrapped).
Then("the step wrapper has run", () => {
  expect(wrapped.count).toBeGreaterThan(0);
});

// setParallelCanAssign is a no-op (parallel is forbidden), so calling it with a
// validator must not throw in either realm — the validator is simply never run.
Then("setParallelCanAssign is callable", () => {
  expect(() => setParallelCanAssign(() => true)).not.toThrow();
});

// A never-settling body with a per-step timeout: Cucumber's NATIVE step timeout
// must fire and fail the step — in node directly, and in browser via the non-
// blocking pump (which lets the loop advance past the orphaned body).
Then("the step exceeds its timeout", { timeout: 100 }, async () => {
  await new Promise(() => undefined);
});

Given("attachments are recorded", function record(this: TestWorld) {
  // The base World (via IWorldOptions) provides attach/log/link in both realms.
  expect(typeof this.attach).toBe("function");
  expect(typeof this.log).toBe("function");
  this.log("a log line");
  this.attach("a plain text note", "text/plain");
  this.link("https://example.com/report");
  // base64 string + `base64:` media type — the screenshot pattern.
  this.attach(PNG, { mediaType: "base64:image/png" });
});

Then(
  "the world parameter {word} should be {string}",
  function worldParam(this: TestWorld, key: string, expected: string) {
    expect(String(this.parameters[key])).toBe(expected);
  },
);

Then(
  "the hook count should be {int}",
  function hookCount(this: TestWorld, expected: number) {
    expect(this.hookCount).toBe(expected);
  },
);

Then(
  "the beforeStep count should be {int}",
  function beforeStep(this: TestWorld, expected: number) {
    expect(this.beforeStepCount).toBe(expected);
  },
);

Then(
  "the afterStep count should be {int}",
  function afterStep(this: TestWorld, expected: number) {
    expect(this.afterStepCount).toBe(expected);
  },
);

Then(
  "the scenario name should be {string}",
  function scenarioName(this: TestWorld, expected: string) {
    expect(this.scenarioName).toBe(expected);
  },
);

Then(
  "BeforeAll should have run {int} time",
  function beforeAllCount(expected: number) {
    expect(lifecycle.beforeAll).toBe(expected);
  },
);

Then(
  "the color {color} maps to {string}",
  function color(this: TestWorld, color: string, expected: string) {
    // `{color}` is a string-regexp parameter type whose transformer uppercases.
    expect(color).toBe(expected);
  },
);

Then(
  "the {fruit} matches verbatim as {string}",
  function fruit(this: TestWorld, fruit: string, expected: string) {
    // `{fruit}` is an array-regexp parameter type with no transformer, so the
    // matched text passes through identity.
    expect(fruit).toBe(expected);
  },
);

Then("the tag-expression hook ran", function ran(this: TestWorld) {
  expect(this.tagExpr).toBe(true);
});

Then("the tag-expression hook did not run", function notRan(this: TestWorld) {
  expect(this.tagExpr).toBe(false);
});
