// A run's start, prepared as Vitest starts it (before any worker or page), for its report
// (`./runReport.ts`): its opening, its `meta` (a placeholder: `./meta.ts`) and every feature
// file of its test files once (their sources, documents and pickles, from the plans the plugins made
// for the run's start: `../plugin/createPlugin.ts`, the same ids in every plugin: `../feature/plan.ts`).
import { makeSourceEnvelope } from "@cucumber/gherkin";
import type { Envelope, Timestamp } from "@cucumber/messages";
import type { FailedPlan, VitestPlan } from "../feature/plans.ts";
import { metaEnvelope } from "./meta.ts";

/** A feature file of a run's test files, as its project's plugin planned it. */
export interface PlannedFeature {
  feature: string;
  /** Its path from its plugin's root, with `/` (cucumber's `uri`). */
  uri: string;
  plan: VitestPlan | FailedPlan;
  /** Its text. */
  content: string;
}

/** A run's start, as its report sends it: its time, its opening. */
export interface RunStart {
  started: Timestamp;
  envelopes: readonly Envelope[];
}

/** The start of a run (at `started`) of its planned feature files. */
export const runStartOf = (
  started: Timestamp,
  features: readonly PlannedFeature[],
): RunStart => {
  // Each feature file once, whichever projects run it.
  const files = new Map(
    features.map(({ feature, uri, plan, content }) => [
      feature,
      { uri, plan, content },
    ]),
  );
  const sources = [...files]
    .sort(([a], [b]) => a.localeCompare(b))
    .flatMap(([, { uri, plan, content }]): Envelope[] => [
      makeSourceEnvelope(content, uri),
      ...("error" in plan
        ? []
        : [
            { gherkinDocument: plan.gherkin.document },
            ...plan.gherkin.pickles.map((pickle) => ({ pickle })),
          ]),
    ]);
  return {
    started,
    envelopes: [metaEnvelope, ...sources],
  };
};
