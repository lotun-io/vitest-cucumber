import { expect, test, vi } from "vitest";
import { fileCache } from "../fileCache.ts";

test("a file's value is made again only when its text changes, each file its own", () => {
  const valueOf = fileCache<string>();
  const make = vi.fn((value: string) => value);
  expect(valueOf("/a.ts", "one", () => make("first"))).toBe("first");
  expect(valueOf("/a.ts", "one", () => make("second"))).toBe("first");
  expect(make).toHaveBeenCalledTimes(1);
  expect(valueOf("/b.ts", "one", () => make("b"))).toBe("b");
  expect(valueOf("/a.ts", "two", () => make("third"))).toBe("third");
  expect(valueOf("/a.ts", "one", () => make("fourth"))).toBe("fourth");
  expect(make).toHaveBeenCalledTimes(4);
});

test("a file dropped, or every file cleared: made again", () => {
  const valueOf = fileCache<string>();
  const make = vi.fn(() => "made");
  valueOf("/a.ts", "one", make);
  valueOf("/b.ts", "one", make);
  valueOf.drop("/a.ts");
  valueOf("/a.ts", "one", make);
  valueOf("/b.ts", "one", make);
  expect(make).toHaveBeenCalledTimes(3);
  valueOf.clear();
  valueOf("/b.ts", "one", make);
  expect(make).toHaveBeenCalledTimes(4);
});
