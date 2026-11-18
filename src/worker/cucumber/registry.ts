// Records every call the support code makes to the plugin's `@cucumber/cucumber` stand-in (its
// support code methods: `./recorders.ts`), as it's made: its method, its arguments and its
// stack (where the call was made). The runtime builds its support code from them
// (`../runner/supportCode.ts`), with the definition function wrapper, kept apart (cucumber applies it
// as it builds). Once the support code has loaded, a call fails: stricter than cucumber, which
// ignores one once its library is built. Page-safe.

import type { Code, SupportCall } from "../../types/supportCode.ts";
import { pluginError } from "../../utils/errors.ts";

/** The support code's calls, in order, its definition function wrapper, and whether it has loaded. */
export const registry = {
  calls: [] as Omit<SupportCall, "location">[],
  wrapper: undefined as
    ((code: Code, wrapperOptions: unknown) => Code) | undefined,
  loaded: false,
};

/** Throws once the support code has loaded: `method` was called too late. */
const checkLoading = (method: string) => {
  if (registry.loaded) {
    throw pluginError(`"${method}" was called after the support code loaded`);
  }
};

/** A recording stand-in for cucumber's `method`. */
export const record =
  (method: string) =>
  (...args: unknown[]) => {
    checkLoading(method);
    registry.calls.push({ method, args, stack: new Error().stack });
  };

/** Cucumber's `setDefinitionFunctionWrapper`: kept apart, not recorded. */
export const recordWrapper = (fn: unknown) => {
  checkLoading("setDefinitionFunctionWrapper");
  registry.wrapper = fn as (code: Code, wrapperOptions: unknown) => Code;
};
