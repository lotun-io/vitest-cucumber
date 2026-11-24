// The page's `@cucumber/cucumber`: a page (browser mode's, Storybook's story tests' and its preview's)
// runs the plugin's own copy of cucumber's runtime (`../runner/`). Every export of cucumber 13.3.0 is here, typed as cucumber's:
// - the support code's methods (`Given`, `Before`, …) record their calls (`./recorders.ts`),
//   which the page builds its support code from (`../runner/supportCode.ts`), refusing the ones the
//   plugin doesn't support in any mode (`setDefaultTimeout`, `setParallelCanAssign`) there;
// - what the code uses while it runs (`World`, `DataTable`, `world`, `context`, …) is real;
// - the runner's and formatters' exports are stand-ins that throw when used (the page has no cucumber
//   runtime to give them; node mode's worker has cucumber's own: `./unsupported.ts`). They exist so
//   that importing one works and using it fails with a clear reason.
import type * as Cucumber from "@cucumber/cucumber";
import { wrapPromiseWithTimeout as runtimeWrapPromiseWithTimeout } from "../runner/timeout.ts";
import { unsupported } from "./unsupported.ts";

// The support code's methods: each call is recorded (the two the plugin doesn't support too, refused
// with the call's location as the support code is built).
export {
  After,
  AfterAll,
  AfterStep,
  Before,
  BeforeAll,
  BeforeStep,
  defineParameterType,
  defineStep,
  Given,
  setDefaultTimeout,
  setDefinitionFunctionWrapper,
  setParallelCanAssign,
  setWorldConstructor,
  Then,
  When,
} from "./recorders.ts";
export { context, world } from "./scope.ts";

// What the support code uses while it runs.

export { DataTable } from "./dataTable.ts";
export { World } from "./world.ts";

// Cucumber's `Status` is `@cucumber/messages`' `TestStepResultStatus` itself.
export { TestStepResultStatus as Status } from "@cucumber/messages";

/**
 * A BeforeAll or AfterAll hook's target (`COORDINATOR` isn't supported): cucumber's own TypeScript
 * enum, which a plain object only matches through a cast (its members are nominal).
 */
export const HookTarget = {
  WORKER: "WORKER",
  COORDINATOR: "COORDINATOR",
} as typeof Cucumber.HookTarget;

/** Cucumber's (`../runner/timeout.ts`). */
export const wrapPromiseWithTimeout: typeof Cucumber.wrapPromiseWithTimeout =
  runtimeWrapPromiseWithTimeout;

/**
 * Main's cucumber version, as the page's host gives it (`setVersion`) before the support code loads:
 * a Vitest page (`../browser/importPageSupport.ts`, from `../browser/pageHost.ts`), Storybook's
 * preview (which has no Vitest to ask).
 * A live binding: every importer sees it.
 */
export let version: typeof Cucumber.version = "";

/** Sets `version` (the page's host, before the support code loads). */
export const setVersion = (cucumberVersion: string) => {
  version = cucumberVersion;
};

// The runner's and formatters' exports: the page has no cucumber runtime of its own to give them (node
// mode's worker has cucumber's own), so they're stand-ins that throw.
export const Formatter = unsupported<typeof Cucumber.Formatter>("Formatter");
export const FormatterBuilder =
  unsupported<typeof Cucumber.FormatterBuilder>("FormatterBuilder");
export const JsonFormatter =
  unsupported<typeof Cucumber.JsonFormatter>("JsonFormatter");
export const ProgressFormatter =
  unsupported<typeof Cucumber.ProgressFormatter>("ProgressFormatter");
export const RerunFormatter =
  unsupported<typeof Cucumber.RerunFormatter>("RerunFormatter");
export const SnippetsFormatter =
  unsupported<typeof Cucumber.SnippetsFormatter>("SnippetsFormatter");
export const SummaryFormatter =
  unsupported<typeof Cucumber.SummaryFormatter>("SummaryFormatter");
export const UsageFormatter =
  unsupported<typeof Cucumber.UsageFormatter>("UsageFormatter");
export const UsageJsonFormatter =
  unsupported<typeof Cucumber.UsageJsonFormatter>("UsageJsonFormatter");
export const formatterHelpers =
  unsupported<typeof Cucumber.formatterHelpers>("formatterHelpers");
export const supportCodeLibraryBuilder = unsupported<
  typeof Cucumber.supportCodeLibraryBuilder
>("supportCodeLibraryBuilder");
export const TestCaseHookDefinition = unsupported<
  typeof Cucumber.TestCaseHookDefinition
>("TestCaseHookDefinition");
export const parallelCanAssignHelpers = unsupported<
  typeof Cucumber.parallelCanAssignHelpers
>("parallelCanAssignHelpers");
