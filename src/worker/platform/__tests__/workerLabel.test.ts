import { expect, test } from "vitest";
import { workerLabel } from "../workerLabel.ts";

test("a worker's id in the messages: its project named; an unnamed project's, the number alone", () => {
  expect(workerLabel("1", "in-browser (chromium)")).toBe(
    "1 [in-browser (chromium)]",
  );
  expect(workerLabel("2", "")).toBe("2");
});
