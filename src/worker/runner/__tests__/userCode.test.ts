import { expect, test } from "vitest";
import { textOf } from "../userCode.ts";

test("textOf: a string as it is, any other value as cucumber's `util.format` shows it, never throwing", () => {
  const noPrototype = Object.assign(Object.create(null) as object, { code: 1 });
  const throwing = {
    toString() {
      throw new Error("no text");
    },
  };
  expect(textOf("text")).toBe("text");
  expect(textOf(noPrototype)).toBe("{ code: 1 }");
  expect(textOf(throwing)).toBe("{ toString: [Function toString] }");
  expect(textOf({ a: 1 })).toBe("{ a: 1 }");
  expect(textOf(42)).toBe("42");
  expect(textOf(null)).toBe("null");
  expect(textOf(10n)).toBe("10n");
});
