import { expect, test } from "vitest";
import type { Vitest } from "vitest/node";
import { colorsOf } from "../colors.ts";

/** A Vitest whose printer formats an error as `output`. */
const vitestPrinting = (output: string) =>
  ({ logger: { formatError: () => ({ output }) } }) as unknown as Vitest;

test("Vitest's output has colors as its printer's error does: with color codes, colors; without, none", () => {
  expect(colorsOf(vitestPrinting("\u001b[31mError\u001b[39m"))).toBe(true);
  expect(colorsOf(vitestPrinting("Error"))).toBe(false);
});
