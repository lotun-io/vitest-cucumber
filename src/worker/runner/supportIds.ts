// The support code's message ids (its step definitions', hooks', parameter types'): the same in every
// worker and page that loaded the same support code, so a run's messages have each definition once
// (main keeps one of each: `../../core/runs/runReport.ts`). UUIDs (v5): under a namespace made
// from the support code's calls (each one's method, location and pattern), by position, since `@cucumber/core` asks for an id per
// definition, in the order they're registered (the plugin's step hooks take none). Support code that differs between workers gets
// different ids. Page-safe.
import { v5 } from "uuid";
import type { SupportCall } from "../../types/supportCode.ts";

/** The namespace of every support code's ids (a fixed UUID: the plugin's own). */
const namespace = "2d5f7f0c-6d0a-4c47-9b8f-3f1c9a0b6e51";

/** A call's part of its support code's shape: its method, location and first argument (a pattern). */
const shapeOf = ({ method, location, args }: SupportCall) => [
  method,
  location?.uri,
  location?.line,
  location?.column,
  args[0] instanceof RegExp
    ? String(args[0])
    : typeof args[0] === "string"
      ? args[0]
      : typeof args[0],
];

/** The support code's id generator: the n-th id of the support code `calls` make. */
export const supportIds = (calls: readonly SupportCall[]) => {
  const supportNamespace = v5(JSON.stringify(calls.map(shapeOf)), namespace);
  let next = 0;
  return () => v5(String(next++), supportNamespace);
};
