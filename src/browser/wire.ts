/**
 * The one rule for values crossing the Node↔page channel.
 *
 * Most values structured-clone fine; the exceptions each get a tagged marker so
 * there is a single encode/decode contract instead of per-type ad-hoc handling:
 *
 * - **DataTable** — built by native Cucumber on Node; encoded to `{__vc:"dataTable"}`
 *   and rebuilt as a real `DataTable` in the page.
 * - **handle** — a page-resident value (e.g. a parameter-type transform result, a
 *   class instance) that must survive a Node round-trip: it's held in the page
 *   and only an opaque id crosses, swapped back when the step runs.
 *
 * Add a non-cloneable type here once; callers stay untouched.
 */

import { DataTable } from "./dataTable.ts";

type DataTableWire = { __vc: "dataTable"; rows: string[][] };
type HandleWire = { __vc: "handle"; id: string };
type Wire = DataTableWire | HandleWire;

const isWire = (value: unknown): value is Wire =>
  typeof value === "object" && value !== null && "__vc" in value;

// Page-resident handles (transform results); only the id crosses the wire.
const handles = new Map<string, unknown>();

// Node → wire is inline at the proxy (it has the real Cucumber DataTable);
// this module owns the marker format + the page side. Page → wire: park a
// non-serializable value, return its marker.
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
