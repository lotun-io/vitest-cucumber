// Cucumber's `DataTable` for the plugin's `@cucumber/cucumber` stand-in, both modes: a step's data
// table argument. Page-safe.
import type { PickleTable } from "@cucumber/messages";

/** Cucumber's data table (a copy of 13.3.0's `lib/models/data_table.ts`), built from a pickle's. */
export class DataTable {
  private readonly rawTable: string[][];

  constructor(sourceTable: PickleTable | string[][]) {
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
    const keys = copy[0] ?? [];
    const valuesArray = copy.slice(1);
    return valuesArray.map((values) => {
      const rowObject: Record<string, string> = {};
      keys.forEach((key, index) => {
        rowObject[key] = values[index] as string;
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
      result[x[0] as string] = x[1] as string;
    }
    return result;
  }

  transpose(): DataTable {
    // As cucumber's: an empty table's `transpose` throws (no feature file has one).
    const transposed = (this.rawTable[0] as string[]).map((_x, i) =>
      this.rawTable.map((y) => y[i] as string),
    );
    return new DataTable(transposed);
  }
}
