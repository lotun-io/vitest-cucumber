/**
 * Browser-side `DataTable`, copied verbatim from @cucumber/cucumber
 * (src/models/data_table.ts). It's browser-safe because its only import is
 * type-only (erased at build time) and the body is pure string manipulation.
 *
 * The real `DataTable` is built on Node by native Cucumber, but a class instance
 * can't cross the Vitest command channel intact — so the Node side serializes it
 * to its raw `string[][]` form wrapped in a marker, and the browser rebuilds a
 * real `DataTable` from it here (so `dataTable instanceof DataTable` holds and
 * the full API works in step bodies).
 */

import type * as messages from "@cucumber/messages";

// Marker key wrapping a serialized table as it crosses the channel. A plain
// string property (not a Symbol) so it survives structured clone.
export const DATA_TABLE_MARKER = "__vitestCucumberBrowserDataTable__";

export type DataTableMarker = { [DATA_TABLE_MARKER]: string[][] };

export const isDataTableMarker = (value: unknown): value is DataTableMarker =>
  typeof value === "object" && value !== null && DATA_TABLE_MARKER in value;

export class DataTable {
  private readonly rawTable: string[][];

  constructor(sourceTable: messages.PickleTable | string[][]) {
    if (Array.isArray(sourceTable)) {
      this.rawTable = sourceTable;
    } else {
      this.rawTable = sourceTable.rows.map((row) =>
        row.cells.map((cell) => cell.value),
      );
    }
  }

  hashes(): Record<string, string>[] {
    const copy = this.raw();
    const keys = copy[0];
    const valuesArray = copy.slice(1);
    return valuesArray.map((values) => {
      const rowObject: Record<string, string> = {};
      keys.forEach((key, index) => {
        rowObject[key] = values[index];
      });
      return rowObject;
    });
  }

  raw(): string[][] {
    return this.rawTable.slice(0);
  }

  rows(): string[][] {
    const copy = this.raw();
    copy.shift();
    return copy;
  }

  rowsHash(): Record<string, string> {
    const rows = this.raw();
    const everyRowHasTwoColumns = rows.every((row) => row.length === 2);
    if (!everyRowHasTwoColumns) {
      throw new Error(
        "rowsHash can only be called on a data table where all rows have exactly two columns",
      );
    }
    const result: Record<string, string> = {};
    for (const x of rows) {
      result[x[0]] = x[1];
    }
    return result;
  }

  transpose(): DataTable {
    const transposed = this.rawTable[0].map((_x, i) =>
      this.rawTable.map((y) => y[i]),
    );
    return new DataTable(transposed);
  }
}
