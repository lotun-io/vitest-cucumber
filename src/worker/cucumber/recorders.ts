// The support code's methods of the plugin's `@cucumber/cucumber` stand-in, typed as cucumber's: each
// call is recorded (`./registry.ts`). Both modes' stand-ins have them. Page-safe.
import type * as Cucumber from "@cucumber/cucumber";
import { record, recordWrapper } from "./registry.ts";

export const Given: typeof Cucumber.Given = record("Given");
export const When: typeof Cucumber.When = record("When");
export const Then: typeof Cucumber.Then = record("Then");
export const defineStep: typeof Cucumber.defineStep = record("defineStep");
export const Before: typeof Cucumber.Before = record("Before");
export const After: typeof Cucumber.After = record("After");
export const BeforeStep: typeof Cucumber.BeforeStep = record("BeforeStep");
export const AfterStep: typeof Cucumber.AfterStep = record("AfterStep");
export const BeforeAll: typeof Cucumber.BeforeAll = record("BeforeAll");
export const AfterAll: typeof Cucumber.AfterAll = record("AfterAll");
export const defineParameterType: typeof Cucumber.defineParameterType = record(
  "defineParameterType",
);
export const setWorldConstructor: typeof Cucumber.setWorldConstructor = record(
  "setWorldConstructor",
);
/**
 * Methods the plugin doesn't support (Vitest's `testTimeout` and `hookTimeout` are the default
 * timeouts; Vitest assigns the feature files to its workers): recorded as the others, refused as
 * the support code is built, with the call's location (`../runner/supportCode.ts`).
 */
export const setDefaultTimeout: typeof Cucumber.setDefaultTimeout =
  record("setDefaultTimeout");
export const setParallelCanAssign: typeof Cucumber.setParallelCanAssign =
  record("setParallelCanAssign");
/** Kept apart: the runtime applies it as it builds its support code (`../runner/supportCode.ts`). */
export const setDefinitionFunctionWrapper: typeof Cucumber.setDefinitionFunctionWrapper =
  recordWrapper;
