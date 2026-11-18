// A cucumber run's messages, read once as they arrive, then looked up (`Query`, made by
// `../worker/runner/query.ts`'s `createQuery`): its results, a step's text and Gherkin location, its
// attachments, its parameter types, and what the summary reads. Named after `@cucumber/query`, but
// only what the plugin needs. Page-safe.
import type {
  Attachment,
  Envelope,
  Hook,
  Location,
  ParameterType,
  PickleStep,
  Step,
  StepDefinition,
  Suggestion,
  TestRunFinished,
  TestStep,
  TestStepResult,
  UndefinedParameterType,
} from "@cucumber/messages";

/**
 * A finished test step's (or test run hook's) result (its real errors on it:
 * `../worker/runner/failures.ts`). `testStepId` is set only for test steps.
 */
export interface Finished {
  result: TestStepResult;
  testStepId?: string;
}

/** A run's query. The lists it gives are kept up to date: read, never written. */
export interface Query {
  /** The run's own messages, in order (not its context's, nor the support query's). */
  envelopes(): readonly Envelope[];
  /** Its finished test steps and test run hooks, in order. */
  results(): readonly Finished[];
  /** Its finished test steps (not its test run hooks), in order. */
  testStepResults(): readonly Finished[];
  /** Its attachments, in order. */
  attachments(): readonly Attachment[];
  /** The parameter types its support code defines. */
  parameterTypes(): readonly ParameterType[];
  /** The parameter types its support code's expressions name but nobody defined. */
  undefinedParameterTypes(): readonly UndefinedParameterType[];
  /** Its undefined steps' suggestions (their snippets), in order. */
  suggestions(): readonly Suggestion[];
  /** The test step `testStepId`, if its test case was read. */
  testStep(testStepId: string): TestStep | undefined;
  /** The Gherkin step a pickle step comes from (its keyword, its location). */
  stepOf(pickleStep: PickleStep): Step | undefined;
  /** A step definition, by id. */
  stepDefinition(id: string): StepDefinition | undefined;
  /** A hook, by id. */
  hook(id: string): Hook | undefined;
  /** The first undefined, pending or ambiguous result, if any. */
  firstUnexplained(): Finished | undefined;
  /** The run's `testRunFinished`, once it's read. */
  testRunFinished(): TestRunFinished | undefined;
  /** Reads one more of the run's messages, and keeps it. */
  update(envelope: Envelope): void;
  /** The pickle step test step `testStepId` runs, if it's a step (not a hook). */
  pickleStepOf(testStepId: string | undefined): PickleStep | undefined;
  /**
   * A test step's text as the feature file reads (keyword included, an outline's with the example's
   * values) and its Gherkin location. A hook's text is `Before hook failed` or `After hook failed`,
   * with no location: its errors' own frames point at the hook.
   */
  testStepOf(testStepId: string | undefined): {
    text: string;
    location?: Location;
  };
  /** The texts of the undefined steps (an outline's with its example's values). */
  undefinedStepTexts(): string[];
}
