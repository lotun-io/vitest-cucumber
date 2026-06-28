import {
  DataTable,
  defineStep,
  Given,
  Then,
  When,
  world,
} from "@cucumber/cucumber";
import { expect } from "vitest";
import type { TestWorld } from "../support/world.ts";

Given("a value of {int}", function valueOf(this: TestWorld, n: number) {
  this.value = n;
});

When("I double it", function double(this: TestWorld) {
  this.value *= 2;
});

When("I add {int}", function add(this: TestWorld, n: number) {
  this.value += n;
});

Then(
  "the value should be {int}",
  function shouldBe(this: TestWorld, expected: number) {
    expect(this.value).toBe(expected);
  },
);

Then(
  "the world value should be {int}",
  function worldValue(this: TestWorld, expected: number) {
    expect(this.value).toBe(expected);
  },
);

// `When`/`defineStep` are aliases of `Given` — prove they register too.
When("the value is doubled", function doubled(this: TestWorld) {
  this.value *= 2;
});

defineStep("the value is incremented", function incremented(this: TestWorld) {
  this.value += 1;
});

// Arrow function: no `this` binding, so reach the World via the `world` export.
Given("an arrow value of {int}", (n: number) => {
  (world as unknown as TestWorld).value = n;
});

// Callback interface: complete asynchronously via the appended callback.
Given(
  "a deferred value of {int}",
  function deferred(
    this: TestWorld,
    n: number,
    callback: (error?: unknown) => void,
  ) {
    setTimeout(() => {
      this.value = n;
      callback();
    }, 0);
  },
);

// Step definition options ({ timeout }) are forwarded to the runtime.
Given(
  "a value of {int} with a timeout",
  { timeout: 5000 },
  function withTimeout(this: TestWorld, n: number) {
    this.value = n;
  },
);

// A real DataTable instance (rebuilt in the browser from its serialized rows).
Given(
  "the following values:",
  function fromTable(this: TestWorld, table: DataTable) {
    expect(table).toBeInstanceOf(DataTable);
    const [row] = table.hashes();
    this.value = Number(row.value);
  },
);

// Exercises every DataTable accessor (raw/rows/hashes/rowsHash/transpose) so the
// browser-side DataTable port is covered end-to-end.
Given(
  "a table with every accessor:",
  function everyAccessor(this: TestWorld, table: DataTable) {
    expect(table.raw()).toEqual([
      ["key", "value"],
      ["a", "1"],
      ["b", "2"],
    ]);
    expect(table.rows()).toEqual([
      ["a", "1"],
      ["b", "2"],
    ]);
    expect(table.hashes()).toEqual([
      { key: "a", value: "1" },
      { key: "b", value: "2" },
    ]);
    expect(table.rowsHash()).toEqual({ key: "value", a: "1", b: "2" });
    expect(table.transpose().raw()).toEqual([
      ["key", "a", "b"],
      ["value", "1", "2"],
    ]);
  },
);
