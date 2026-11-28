import { afterEach, describe, expect, inject, test, vi } from "vitest";
import {
  context,
  DataTable,
  Formatter,
  setDefaultTimeout,
  setDefinitionFunctionWrapper,
  setParallelCanAssign,
  setVersion,
  version,
  world,
  wrapPromiseWithTimeout,
} from "../page.ts";
import * as recorders from "../recorders.ts";
import { registry } from "../registry.ts";
import { useScope } from "../scope.ts";

/** What the proxies read (a scope of the test's own: set directly). */
const scope = {
  world: undefined as object | undefined,
  context: undefined as object | undefined,
};
useScope({
  world: () => scope.world,
  context: () => scope.context,
  withWorld: (_world, run) => run(),
  withContext: (_context, run) => run(),
  endTestCase: () => undefined,
});

afterEach(() => {
  scope.world = undefined;
  scope.context = undefined;
  registry.wrapper = undefined;
});

describe("world and context (cucumber's proxies)", () => {
  test("every operation on `world`, the running World's", () => {
    class TestWorld {
      kept = 1;
    }
    const current = new TestWorld() as TestWorld & Record<string, unknown>;
    scope.world = current;
    const proxy = world as unknown as Record<string, unknown>;
    proxy.added = 2;
    expect(current.added).toBe(2);
    expect(proxy.kept).toBe(1);
    expect("kept" in proxy).toBe(true);
    expect(Object.keys(proxy)).toEqual(["kept", "added"]);
    expect(Object.getOwnPropertyDescriptor(proxy, "kept")?.value).toBe(1);
    Object.defineProperty(proxy, "defined", { value: 3, configurable: true });
    expect(current.defined).toBe(3);
    expect(delete proxy.added).toBe(true);
    expect("added" in current).toBe(false);
    expect(Object.getPrototypeOf(proxy)).toBe(TestWorld.prototype);
    const prototype = {};
    Object.setPrototypeOf(proxy, prototype);
    expect(Object.getPrototypeOf(current)).toBe(prototype);
    expect(Object.isExtensible(proxy)).toBe(true);
    // As cucumber's own proxy: its target stays extensible, so JavaScript refuses the trap's `true`.
    expect(() => Object.preventExtensions(proxy)).toThrow(TypeError);
    expect(Object.isExtensible(current)).toBe(false);
  });

  test("`context`, the running BeforeAll or AfterAll hook's", () => {
    scope.context = { parameters: { a: 1 } };
    expect((context as { parameters: unknown }).parameters).toEqual({ a: 1 });
  });

  test("outside their scope, cucumber's errors", () => {
    expect(() => (world as unknown as { x: unknown }).x).toThrow(
      "Attempted to access `world` from incorrect scope; only applicable to steps and case-level hooks",
    );
    expect(() => (context as unknown as { x: unknown }).x).toThrow(
      "Attempted to access `context` from incorrect scope; only applicable to run-level hooks",
    );
  });
});

describe("the support code's other exports", () => {
  test("setDefinitionFunctionWrapper: the page's wrapper (not recorded)", () => {
    const wrapper = (code: () => void) => code;
    setDefinitionFunctionWrapper(wrapper);
    expect(registry.wrapper).toBe(wrapper);
  });

  test("wrapPromiseWithTimeout: the promise's outcome within the timeout", async () => {
    await expect(wrapPromiseWithTimeout(Promise.resolve(5), 50)).resolves.toBe(
      5,
    );
    const failure = new Error("Failed in time");
    await expect(
      wrapPromiseWithTimeout(Promise.reject(failure), 50),
    ).rejects.toBe(failure);
  });

  test("wrapPromiseWithTimeout: past the timeout, cucumber's error, or the given message", async () => {
    const never = new Promise<never>(() => {});
    await expect(wrapPromiseWithTimeout(never, 10)).rejects.toThrow(
      "Action did not complete within 10 milliseconds",
    );
    await expect(
      wrapPromiseWithTimeout(never, 10, "The dialog never opened"),
    ).rejects.toThrow("The dialog never opened");
  });

  test("wrapPromiseWithTimeout: the real timers, not a test's fakes", async () => {
    vi.useFakeTimers();
    try {
      await expect(
        wrapPromiseWithTimeout(new Promise<never>(() => {}), 10),
      ).rejects.toThrow("Action did not complete within 10 milliseconds");
    } finally {
      vi.useRealTimers();
    }
  });

  test("version: main's cucumber's, as the page's host gives it before the support code loads", () => {
    setVersion(inject("vitestCucumber").version);
    expect(version).toBe(inject("vitestCucumber").version);
  });

  test("a DataTable of a pickle's table, its cells' values", () => {
    const table = new DataTable({
      rows: [
        { cells: [{ value: "a" }, { value: "b" }] },
        { cells: [{ value: "1" }, { value: "2" }] },
      ],
    });
    expect(table.hashes()).toEqual([{ a: "1", b: "2" }]);
  });
});

describe("the runner's exports, stand-ins that throw", () => {
  const reason =
    "[@lotun/vitest-cucumber] Formatter isn't supported in a browser page";

  test("a call, `new`, reading, writing or testing a property", () => {
    const stand = Formatter as unknown as Record<string, unknown> &
      (new () => unknown) &
      (() => unknown);
    expect(() => (stand as () => unknown)()).toThrow(reason);
    expect(() => new stand()).toThrow(reason);
    expect(() => stand.anything).toThrow(reason);
    expect(() => {
      stand.anything = "x";
    }).toThrow(reason);
    expect(() => "anything" in stand).toThrow(reason);
  });

  test("the support code methods it doesn't support: recorded as the others (refused as the support code is built, with the call's location)", () => {
    expect(setDefaultTimeout).toBe(recorders.setDefaultTimeout);
    expect(setParallelCanAssign).toBe(recorders.setParallelCanAssign);
  });

  test("passed on, not used: returned from an async function, awaited, given to JSON.stringify", async () => {
    const stand = Formatter as unknown as Record<string, unknown>;
    expect(stand.then).toBeUndefined();
    expect(stand.toJSON).toBeUndefined();
    const passed = async () => Formatter;
    expect(await passed()).toBe(Formatter);
    expect(() => JSON.stringify({ stand })).not.toThrow();
  });

  test("reading a symbol, allowed (to inspect it)", () => {
    expect(
      (Formatter as unknown as Record<symbol, unknown>)[Symbol.toStringTag],
    ).toBeUndefined();
  });
});

describe("DataTable, as cucumber's own (the page's is a copy of it)", () => {
  /** Each method's outcome on `rows`: its value, or its error's message. */
  const outcomes = (
    Table: new (rows: string[][]) => unknown,
    rows: string[][],
  ) => {
    const table = Table as unknown as new (rows: string[][]) => {
      raw(): string[][];
      rows(): string[][];
      hashes(): Record<string, string>[];
      rowsHash(): Record<string, string>;
      transpose(): { raw(): string[][] };
    };
    const outcomeOf = (call: () => unknown) => {
      try {
        return { value: call() };
      } catch (error) {
        return { error: (error as Error).message };
      }
    };
    const of = () => new table(rows.map((row) => [...row]));
    return {
      raw: outcomeOf(() => of().raw()),
      rows: outcomeOf(() => of().rows()),
      hashes: outcomeOf(() => of().hashes()),
      rowsHash: outcomeOf(() => of().rowsHash()),
      transpose: outcomeOf(() => of().transpose().raw()),
    };
  };

  test.each([
    [
      "a header and rows",
      [
        ["a", "b"],
        ["1", "2"],
        ["3", "4"],
      ],
    ],
    [
      "two columns",
      [
        ["key", "value"],
        ["k", "v"],
      ],
    ],
    [
      "three columns (no `rowsHash`)",
      [
        ["a", "b", "c"],
        ["1", "2", "3"],
      ],
    ],
    ["one row", [["only"]]],
    ["no rows", []],
  ])("%s", async (_name, rows) => {
    const cucumber = await import("@cucumber/cucumber");
    expect(outcomes(DataTable as never, rows)).toEqual(
      outcomes(cucumber.DataTable as never, rows),
    );
  });
});
