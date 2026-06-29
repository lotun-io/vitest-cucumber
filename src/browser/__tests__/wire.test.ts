import { describe, expect, it } from "vitest";
import { DataTable } from "../dataTable.ts";
import { decode, decodeAll, hold } from "../wire.ts";

describe("wire codec", () => {
  it("passes cloneable values through untouched", () => {
    for (const value of [1, "x", true, null, undefined, { a: 1 }, [1, 2]]) {
      expect(decode(value)).toBe(value);
    }
  });

  it("rebuilds a DataTable from its marker", () => {
    const rows = [
      ["a", "b"],
      ["1", "2"],
    ];
    const result = decode({ __vc: "dataTable", rows });
    expect(result).toBeInstanceOf(DataTable);
    expect((result as DataTable).raw()).toEqual(rows);
    expect((result as DataTable).hashes()).toEqual([{ a: "1", b: "2" }]);
  });

  it("redeems a held value via its handle and frees it", () => {
    const instance = { tag: Symbol("only-page-resident") };
    const marker = hold(instance);
    expect(marker).toMatchObject({ __vc: "handle" });
    expect(decode(marker)).toBe(instance);
    // Handle is consumed: a second decode no longer finds it.
    expect(decode(marker)).toBeUndefined();
  });

  it("decodeAll resolves a mixed argument list", () => {
    const handle = hold(42);
    const [num, table, held] = decodeAll([
      7,
      { __vc: "dataTable", rows: [["x"]] },
      handle,
    ]);
    expect(num).toBe(7);
    expect(table).toBeInstanceOf(DataTable);
    expect(held).toBe(42);
  });
});
