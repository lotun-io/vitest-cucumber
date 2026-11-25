// A cucumber run's messages, read once as they arrive (`update`), then looked up: its results, a
// step's text and Gherkin location, its attachments, its parameter types, and what the summary reads
// (`../platform/summary/`: a test step, its Gherkin step, its step definitions, a hook, the suggestions, the
// undefined parameter types). Named after `@cucumber/query`, but only what the plugin needs.
// Page-safe.
import type {
  Attachment,
  Envelope,
  FeatureChild,
  GherkinDocument,
  Hook,
  Location,
  ParameterType,
  PickleStep,
  RuleChild,
  Step,
  StepDefinition,
  Suggestion,
  TestRunFinished,
  TestStep,
  UndefinedParameterType,
} from "@cucumber/messages";
import type { Finished, Query } from "../../types/query.ts";
import { isUnexplained } from "./statuses.ts";

/**
 * What a run's query takes from the support code's query (`support`): its step definitions, hooks
 * and parameter types, read once (`./supportCode.ts`).
 */
type SupportQuery = Pick<
  Query,
  "parameterTypes" | "undefinedParameterTypes" | "stepDefinition" | "hook"
>;

/**
 * A run's query (`../../types/query.ts`): `envelopes` read and kept, and each one `update` reads.
 * `context`: messages that aren't the run's, read for its lookups only, never kept (a scenario's
 * Gherkin document and pickle, a retry's test case). With `support`, the support code's messages
 * (its step definitions, hooks and parameter types) are the support query's, looked up there, never
 * copied or written: a run has none of its own. The lists it gives are kept up to date: read, never
 * written.
 */
export const createQuery = (
  envelopes: readonly Envelope[] = [],
  {
    support,
    context = [],
  }: { support?: SupportQuery; context?: readonly Envelope[] } = {},
): Query => {
  /** The run's own messages, in order. */
  const all: Envelope[] = [];
  /** Its finished test steps and test run hooks, in order. */
  const results: Finished[] = [];
  const attachments: Attachment[] = [];
  /** The parameter types its support code defines. */
  const parameterTypes: ParameterType[] = [];
  /** Each test step, with its test case's steps (a hook's place is around the first step). */
  const testSteps = new Map<
    string,
    { testStep: TestStep; testSteps: readonly TestStep[]; index: number }
  >();
  const pickleSteps = new Map<string, PickleStep>();
  /** The Gherkin steps, by id: a scenario's, a background's or a rule's. */
  const steps = new Map<string, Step>();
  const hooks = new Map<string, Hook>();
  const stepDefinitions = new Map<string, StepDefinition>();
  const suggestions: Suggestion[] = [];
  const undefinedParameterTypes: UndefinedParameterType[] = [];
  let firstUnexplained: Finished | undefined;
  let testRunFinished: TestRunFinished | undefined;

  const finish = (finished: Finished) => {
    results.push(finished);
    if (!firstUnexplained && isUnexplained(finished.result.status)) {
      firstUnexplained = finished;
    }
  };

  const updateSteps = ({ feature }: GherkinDocument) => {
    const add = ({ background, scenario }: FeatureChild | RuleChild) => {
      for (const step of [
        ...(background?.steps ?? []),
        ...(scenario?.steps ?? []),
      ]) {
        steps.set(step.id, step);
      }
    };
    for (const child of feature?.children ?? []) {
      add(child);
      for (const ruleChild of child.rule?.children ?? []) {
        add(ruleChild);
      }
    }
  };

  /** Reads a message for the lookups. */
  const read = (envelope: Envelope) => {
    if (envelope.testStepFinished) {
      const { testStepId, testStepResult } = envelope.testStepFinished;
      finish({ result: testStepResult, testStepId });
    } else if (envelope.testRunHookFinished) {
      finish({ result: envelope.testRunHookFinished.result });
    } else if (envelope.attachment) {
      attachments.push(envelope.attachment);
    } else if (envelope.testCase) {
      const { testSteps: each } = envelope.testCase;
      each.forEach((testStep, index) => {
        testSteps.set(testStep.id, { testStep, testSteps: each, index });
      });
    } else if (envelope.pickle) {
      for (const step of envelope.pickle.steps) {
        pickleSteps.set(step.id, step);
      }
    } else if (envelope.gherkinDocument) {
      updateSteps(envelope.gherkinDocument);
    } else if (envelope.hook) {
      hooks.set(envelope.hook.id, envelope.hook);
    } else if (envelope.parameterType) {
      parameterTypes.push(envelope.parameterType);
    } else if (envelope.stepDefinition) {
      stepDefinitions.set(envelope.stepDefinition.id, envelope.stepDefinition);
    } else if (envelope.suggestion) {
      suggestions.push(envelope.suggestion);
    } else if (envelope.undefinedParameterType) {
      undefinedParameterTypes.push(envelope.undefinedParameterType);
    } else if (envelope.testRunFinished) {
      testRunFinished = envelope.testRunFinished;
    }
  };

  /** The Gherkin step a pickle step comes from. */
  const stepOf = ({ astNodeIds }: PickleStep) => steps.get(astNodeIds[0] ?? "");

  /** The pickle step test step `testStepId` runs, if it's a step (not a hook). */
  const pickleStepOf = (testStepId: string | undefined) => {
    const pickleStepId =
      testStepId === undefined
        ? undefined
        : testSteps.get(testStepId)?.testStep.pickleStepId;
    return pickleStepId === undefined
      ? undefined
      : pickleSteps.get(pickleStepId);
  };

  /**
   * A test step's text as the feature file reads (keyword included, an outline's with the example's
   * values) and its Gherkin location. A hook's text is `Before hook failed` or `After hook failed`,
   * with no location: its errors' own frames point at the hook.
   */
  const testStepOf = (
    testStepId: string | undefined,
  ): { text: string; location?: Location } => {
    const pickleStep = pickleStepOf(testStepId);
    if (pickleStep) {
      const step = stepOf(pickleStep);
      return {
        text: `${step?.keyword ?? ""}${pickleStep.text}`,
        location: step?.location,
      };
    }
    // The hook's type (`BEFORE_TEST_CASE`, `AFTER_TEST_CASE`), else its place around the first step
    // (a scenario without steps has none: its hooks are its Before hooks then).
    const entry =
      testStepId === undefined ? undefined : testSteps.get(testStepId);
    const hookId = entry?.testStep.hookId;
    const type = hookId === undefined ? undefined : hookOf(hookId)?.type;
    const before = type
      ? type.startsWith("BEFORE")
      : !entry ||
        !entry.testSteps.some(
          ({ pickleStepId }, index) =>
            pickleStepId !== undefined && index < entry.index,
        );
    return { text: `${before ? "Before" : "After"} hook failed` };
  };

  /** The texts of the undefined steps (an outline's with its example's values). */
  const undefinedStepTexts = () =>
    results.flatMap(({ result, testStepId }) => {
      const text =
        result.status === "UNDEFINED"
          ? pickleStepOf(testStepId)?.text
          : undefined;
      return text === undefined ? [] : [text];
    });

  /** Reads one more of the run's messages, and keeps it. */
  const update = (envelope: Envelope) => {
    all.push(envelope);
    read(envelope);
  };

  /** A hook, by id: the support query's, if any. */
  const hookOf = (id: string) => (support ? support.hook(id) : hooks.get(id));
  context.forEach(read);
  envelopes.forEach(update);
  return {
    envelopes: (): readonly Envelope[] => all,
    results: (): readonly Finished[] => results,
    testStepResults: (): readonly Finished[] =>
      results.filter(({ testStepId }) => testStepId !== undefined),
    attachments: (): readonly Attachment[] => attachments,
    parameterTypes: (): readonly ParameterType[] =>
      support ? support.parameterTypes() : parameterTypes,
    undefinedParameterTypes: (): readonly UndefinedParameterType[] =>
      support ? support.undefinedParameterTypes() : undefinedParameterTypes,
    suggestions: (): readonly Suggestion[] => suggestions,
    testStep: (testStepId: string) => testSteps.get(testStepId)?.testStep,
    stepOf,
    stepDefinition: (id: string) =>
      support ? support.stepDefinition(id) : stepDefinitions.get(id),
    hook: hookOf,
    firstUnexplained: () => firstUnexplained,
    testRunFinished: () => testRunFinished,
    update,
    pickleStepOf,
    testStepOf,
    undefinedStepTexts,
  };
};
