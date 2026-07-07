// Node↔page serialization for non-cloneable values.
// DataTable → `{__vc:"dataTable", rows}` marker; non-serializable values → opaque handle id.
import { DataTable } from "./dataTable.ts";

type DataTableWire = { __vc: "dataTable"; rows: string[][] };
type HandleWire = { __vc: "handle"; id: string };
type Wire = DataTableWire | HandleWire;

const isWire = (value: unknown): value is Wire =>
  typeof value === "object" && value !== null && "__vc" in value;

// Page-resident handles (transform results); only the id crosses the wire.
const handles = new Map<string, unknown>();

// Park a non-serializable value; return an opaque handle id to cross the wire.
export const hold = (value: unknown): HandleWire => {
  const id = crypto.randomUUID();
  handles.set(id, value);
  return { __vc: "handle", id };
};

// Wire → page: rebuild DataTables, redeem handles, pass everything else through.
export const decode = (value: unknown): unknown => {
  if (!isWire(value)) {
    return value;
  }
  if (value.__vc === "dataTable") {
    return new DataTable(value.rows);
  }
  const held = handles.get(value.id);
  handles.delete(value.id);
  return held;
};

export const decodeAll = (values: unknown[]): unknown[] => values.map(decode);
