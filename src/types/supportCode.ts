// The support code as the runtime runs it, built from the calls the support code made to the
// plugin's `@cucumber/cucumber` stand-in (`../worker/cucumber/registry.ts` records them,
// `../worker/runner/supportCode.ts` builds it). Page-safe.
import type { SupportCodeLibrary } from "@cucumber/core";
import type { IWorldOptions } from "@cucumber/cucumber";
import type { Node } from "@cucumber/tag-expressions";
import type { Query } from "./query.ts";

// Definitions take and return anything (cucumber's own type for them).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Code = (...args: any[]) => unknown;

/** A World's class, as the runtime makes one per scenario (its options cucumber's `IWorldOptions`). */
export type WorldConstructor = new (options: IWorldOptions) => object;

/** Where a definition was made: `uri` relative to the project's root, with `/`. */
export interface DefinitionLocation {
  uri: string;
  line: number;
  column: number;
}

/** A support code call, and where it was made. */
export interface SupportCall {
  method: string;
  args: unknown[];
  location?: DefinitionLocation;
  /** The call's stack (a refused call's error gets its frames, so it points at the call). */
  stack?: string;
}

/** A step's or hook's code (wrapped, if there's a wrapper), with what the runner needs of it. */
export interface Definition {
  code: Code;
  /** Its own timeout (else the default timeout applies). */
  timeout?: number;
  /**
   * Whether the code takes what cucumber gives it as `this` (the World, a test run hook's context)
   * as its first argument too (`../worker/runner/thisFirst.ts`).
   */
  thisFirst: boolean;
}

/** A `BeforeStep` or `AfterStep` hook (core has none). */
export interface StepHook extends Definition {
  /** Its tag expression, compiled (none: every step). */
  tags?: Node;
}

/** The support code the runtime runs (`../worker/runner/supportCode.ts`'s `buildSupportCode`). */
export interface SupportCode {
  /** Core's library: steps, case hooks, run hooks, parameter types. */
  library: SupportCodeLibrary;
  /** The library's messages, read once: every run's query builds on it (its `support`). */
  query: Query;
  /**
   * The definition behind a function core gives (a step's or a hook's `fn`: always one of the
   * support code's; any other, the plugin's internal error).
   */
  definitionOf(fn: unknown): Definition;
  /** In definition order (cucumber runs `AfterStep` hooks in reverse). */
  beforeStepHooks: StepHook[];
  afterStepHooks: StepHook[];
  /** `setWorldConstructor`'s class, if it was called. */
  World?: WorldConstructor;
}
