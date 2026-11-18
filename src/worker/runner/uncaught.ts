// An uncaught error as cucumber's user code runner sees one (13.3.0's
// `lib/uncaught_exception_manager.ts`): while an async call runs (it returned a promise, or takes a
// callback), an uncaught error the host reports fails it; a call that never ends (a timed-out step)
// has its listener removed at the run's end. The host says how it hears of one (`listen`): node
// mode's `process` `uncaughtException`, a page's window `error` (`../node/runtimeEnvironment.ts`,
// `../browser/uncaughtErrors.ts`). Page-safe.
import type { RuntimeEnvironment } from "../../types/runtimeEnvironment.ts";

/**
 * The runtime's `uncaught`, on `listen`: it calls `fail` with each uncaught error and returns how to
 * stop, or nothing if the host has no uncaught errors to hear (a page's code in Node: the unit tests).
 */
export const createUncaught = (
  listen: (fail: (error: unknown) => void) => (() => void) | undefined,
): RuntimeEnvironment["uncaught"] => {
  /** Removes each listener still attached (a call that hasn't ended). */
  const listening = new Set<() => void>();
  return {
    race: (running) => {
      const { promise: uncaught, reject } = Promise.withResolvers<never>();
      const unlisten = listen(reject);
      if (!unlisten) {
        return Promise.resolve(running);
      }
      const stop = () => {
        unlisten();
        listening.delete(stop);
      };
      listening.add(stop);
      return Promise.race([running, uncaught]).finally(stop);
    },
    stopAll: () => {
      for (const stop of [...listening]) {
        stop();
      }
    },
  };
};
