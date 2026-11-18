// A run's report for its stream's subscribers (`./testRuns.ts`): its combined stream of
// Cucumber Messages, made as its workers' and pages' batches come
// (`../../worker/platform/createPlatform.ts`), each batch's messages cucumber's already (the run's
// ids, a retry its test case's next attempt). The report only orders them, cucumber's order but for
// its test cases: its opening, `meta` and each feature file's `source`, `gherkinDocument` and
// `pickle`s (the run's start: `./runStart.ts`), with its first batch or its end, whichever comes
// first (both come once it's the run Vitest runs: Vitest starts a run's workers once the run before
// it ended); the support code's messages, each once (every project's first worker's, the same from
// projects with the same support code); `testRunStarted`; each batch as it comes (a BeforeAll or
// AfterAll run, a scenario's attempt: a pickle's first with its `testCase`, where cucumber sends
// every test case before any runs, so a scenario Vitest never runs has none); `testRunFinished`
// last. Each message goes to every subscriber in order. Nothing kept but which support messages were
// sent. A run nobody wants a report of has none.
import { type Envelope, TimeConversion } from "@cucumber/messages";
import type { MessageBatch } from "../../types/messages.ts";
import type { RunStart } from "./runStart.ts";

/** Now, as messages' timestamps have it. */
const now = () => TimeConversion.millisecondsSinceEpochToTimestamp(Date.now());

export interface RunReport {
  batch(batch: MessageBatch): void;
  /**
   * Its end: `testRunFinished`, its success `passed` (Vitest's verdict of the run:
   * `./testRuns.ts`).
   */
  end(passed: boolean): void;
}

/** A run's report: `start` (its id, its opening), its messages to `subscribers`. */
export const createRunReport = (
  start: RunStart,
  subscribers: readonly ((envelope: Envelope) => void)[],
): RunReport => {
  const send = (envelopes: readonly Envelope[]) => {
    for (const envelope of envelopes) {
      for (const subscriber of subscribers) {
        subscriber(envelope);
      }
    }
  };

  // Its opening, before its first other message.
  let opening: readonly Envelope[] = start.envelopes;
  const opened = (envelopes: readonly Envelope[]) => {
    send([...opening, ...envelopes]);
    opening = [];
  };

  let started = false;
  /** `testRunStarted`, once: after the support code's first messages, before any other batch's. */
  const runStarted = (): Envelope[] => {
    if (started) {
      return [];
    }
    started = true;
    return [{ testRunStarted: { id: "", timestamp: start.started } }];
  };

  /** The support code's messages sent: by id, or by content for one without. */
  const supportSent = new Set<string>();
  /** The support code's messages not sent yet. */
  const newSupport = (envelopes: readonly Envelope[]) =>
    envelopes.filter((envelope) => {
      const { id } = Object.values(envelope)[0] as { id?: string };
      const key = id ?? JSON.stringify(envelope);
      if (supportSent.has(key)) {
        return false;
      }
      supportSent.add(key);
      return true;
    });

  return {
    batch: ({ support, envelopes }) => {
      opened(
        support
          ? [...newSupport(envelopes), ...runStarted()]
          : [...runStarted(), ...envelopes],
      );
    },
    end: (passed) => {
      opened([
        ...runStarted(),
        {
          testRunFinished: {
            testRunStartedId: "",
            success: passed,
            timestamp: now(),
          },
        },
      ]);
    },
  };
};
