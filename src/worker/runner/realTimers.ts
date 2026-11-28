// The timers and clock as the host had them before a project's setup files ran, so a test's fake
// timers (`vi.useFakeTimers()` in a setup file) neither stop a step's timeout nor change a result's
// duration or a message's timestamp. The plugin's own setup file, first in every project's
// `setupFiles` (`../../core/plugin/createPlugin.ts`'s `configureVitest`), saves them
// (`../platform/setupFile.ts`); the runtime takes them as it loads (`./timeout.ts`, `./clock.ts`), or
// the host's as they are then where nothing saved them (Storybook's preview: no Vitest, no setup
// files). Under a registered symbol: one copy of this module or another, a page's or a worker's,
// finds them. Page-safe.

/** The timers and clock the runtime uses. */
export interface RealTimers {
  setTimeout: (callback: () => void, milliseconds: number) => unknown;
  clearTimeout: (id: unknown) => void;
  /** `Date.now`. */
  now: () => number;
  /** `performance.now`. */
  performanceNow: () => number;
}

const key = Symbol.for("@lotun/vitest-cucumber:realTimers");

/** The global object, with the saved timers. */
const host = globalThis as typeof globalThis & { [key]?: RealTimers };

/** The host's timers and clock as they are now. */
const current = (): RealTimers => {
  const { performance } = globalThis;
  const clear = globalThis.clearTimeout.bind(globalThis);
  return {
    setTimeout: globalThis.setTimeout.bind(globalThis),
    clearTimeout: (id) => {
      clear(id as Parameters<typeof clearTimeout>[0]);
    },
    now: Date.now.bind(Date),
    performanceNow: performance.now.bind(performance),
  };
};

/** Saves the host's timers and clock as they are now, once (the plugin's setup file). */
export const saveRealTimers = () => {
  host[key] ??= current();
};

/** The saved timers and clock, else the host's as they are now. */
export const realTimers = (): RealTimers => host[key] ?? current();
