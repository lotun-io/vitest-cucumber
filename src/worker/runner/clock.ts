// Cucumber's stopwatch and timestamps (a port of 13.3.0's `lib/runtime/stopwatch.ts`), on the host's
// real clock (`./realTimers.ts`, saved before a project's setup files could fake it): a test's fake
// timers don't change a result's duration or a message's timestamp. Page-safe.
import { TimeConversion, type Duration } from "@cucumber/messages";
import { realTimers } from "./realTimers.ts";

const { now, performanceNow } = realTimers();

/** Now, as a message's timestamp. */
export const timestamp = () =>
  TimeConversion.millisecondsSinceEpochToTimestamp(now());

/** A zero duration (a result that didn't run). */
export const noDuration = (): Duration =>
  TimeConversion.millisecondsToDuration(0);

/** Starts a stopwatch: call the result for the duration since. */
export const startStopwatch = () => {
  const started = performanceNow();
  return (): Duration =>
    TimeConversion.millisecondsToDuration(performanceNow() - started);
};
