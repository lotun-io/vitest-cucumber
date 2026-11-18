// Cucumber's stopwatch and timestamps (a port of 13.3.0's `lib/runtime/stopwatch.ts`), on the clock
// the page had when this module loaded: a test's fake timers don't change a result's duration or a
// message's timestamp. Page-safe.
import { TimeConversion, type Duration } from "@cucumber/messages";

const RealDate = Date;
const performance = globalThis.performance;

/** Now, as a message's timestamp. */
export const timestamp = () =>
  TimeConversion.millisecondsSinceEpochToTimestamp(RealDate.now());

/** A zero duration (a result that didn't run). */
export const noDuration = (): Duration =>
  TimeConversion.millisecondsToDuration(0);

/** Starts a stopwatch: call the result for the duration since. */
export const startStopwatch = () => {
  const started = performance.now();
  return (): Duration =>
    TimeConversion.millisecondsToDuration(performance.now() - started);
};
