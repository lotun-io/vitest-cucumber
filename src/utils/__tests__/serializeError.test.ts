import { describe, expect, it } from "vitest";
import { serializeError } from "../serializeError.ts";

describe("serializeError", () => {
  describe("non-object input", () => {
    it("wraps a string", () => {
      expect(serializeError("boom")).toEqual({ message: "boom" });
    });

    it("wraps a number", () => {
      expect(serializeError(42)).toEqual({ message: "42" });
    });

    it("wraps undefined", () => {
      expect(serializeError(undefined)).toEqual({ message: "undefined" });
    });

    it("wraps null", () => {
      expect(serializeError(null)).toEqual({ message: "null" });
    });
  });

  describe("Error instances", () => {
    it("captures message, name and stack", () => {
      const error = new Error("oops");
      const result = serializeError(error);
      expect(result.message).toBe("oops");
      expect(result.name).toBe("Error");
      expect(typeof result.stack).toBe("string");
    });

    it("captures a subclass name", () => {
      const result = serializeError(new TypeError("bad type"));
      expect(result).toMatchObject({ message: "bad type", name: "TypeError" });
    });
  });

  describe("extra own properties", () => {
    it("copies serializable own props (e.g. assertion diff fields)", () => {
      const error = Object.assign(new Error("assertion failed"), {
        expected: "a",
        actual: "b",
        showDiff: true,
        code: 7,
      });
      expect(serializeError(error)).toMatchObject({
        message: "assertion failed",
        expected: "a",
        actual: "b",
        showDiff: true,
        code: 7,
      });
    });

    it("skips non-serializable own props (functions, symbols)", () => {
      const error = Object.assign(new Error("x"), {
        fn: () => undefined,
        sym: Symbol("s"),
        ok: 1,
      });
      const result = serializeError(error);
      expect(result.ok).toBe(1);
      expect("fn" in result).toBe(false);
      expect("sym" in result).toBe(false);
    });

    it("does not overwrite message/name/stack from enumerable own props", () => {
      const result = serializeError({
        message: "m",
        name: "N",
        stack: "S",
        extra: 1,
      });
      expect(result).toEqual({ message: "m", name: "N", stack: "S", extra: 1 });
    });
  });

  describe("non-string message", () => {
    it("falls back to String(err) when message is not a string", () => {
      expect(serializeError({ message: 42 })).toEqual({
        message: "[object Object]",
      });
    });
  });
});
