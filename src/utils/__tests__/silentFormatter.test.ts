import { describe, expect, it } from "vitest";
import silentFormatter from "../silentFormatter.ts";

describe("silentFormatter", () => {
  it('has type "formatter"', () => {
    expect(silentFormatter.type).toBe("formatter");
  });

  it("has a formatter function", () => {
    expect(typeof silentFormatter.formatter).toBe("function");
  });

  it("formatter returns null", () => {
    expect(silentFormatter.formatter()).toBeNull();
  });
});
