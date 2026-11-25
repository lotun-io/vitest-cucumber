// The cache of what a project's plans are made of (`./plans.ts`, and the plans built on
// them: `../storybook/stories/storybookPlans.ts`): what's read from disk, each kind in a cache of
// its own (`of`; `single` for a kind with one value), a key's value made at the first ask and
// the same from then on.
// - `clear()` has every cache make its values again at their next ask (a Vitest run's start: the
//   disk may have changed).
// - `changed(key, make)` makes a key's value again and says whether it's another than the one
//   last made (a watcher's event: has what was read from this file changed?), by the cache's own
//   `same`. The one last made is remembered across `clear()`, so the answer doesn't depend on
//   whether a run started in between; one never made hasn't changed (nothing was made from it).
// - `keep(thing)` is for what must outlive `clear()` (what one file's text decides, what a watcher's
//   events are looked up in): `dispose()` empties those too (the plugin's Vitest closed).

/** A project's plan cache. */
export const createPlanCache = () => {
  const caches: { clear(): void; forget(): void }[] = [];
  const kept: { clear(): void }[] = [];

  const clear = () => {
    for (const cache of caches) {
      cache.clear();
    }
  };

  /** A cache of one kind of value, each under its key: two of them are the same if `same` says so. */
  const of = <T>({
    same = Object.is,
  }: { same?: (a: T, b: T) => boolean } = {}) => {
    /** Each key's value, and once cleared the one last made. */
    const entries = new Map<
      string,
      { value?: Promise<T>; last?: Promise<T> }
    >();
    caches.push({
      clear: () => {
        for (const entry of entries.values()) {
          entry.last = entry.value ?? entry.last;
          entry.value = undefined;
        }
      },
      forget: () => {
        entries.clear();
      },
    });
    /** Makes `key`'s value, and keeps it. */
    const put = (key: string, make: () => Promise<T>) => {
      const value = make();
      // Its error is its askers': nothing unhandled here.
      value.catch(() => undefined);
      entries.set(key, { value });
      return value;
    };
    /** `key`'s value: made at the first ask (and the first after `clear()`), the same from then on. */
    const valueOf = (key: string, make: () => Promise<T>) =>
      entries.get(key)?.value ?? put(key, make);
    return Object.assign(valueOf, {
      /** Forgets `key` (its file was deleted, or its value is known to be out of date). */
      drop: (key: string) => {
        entries.delete(key);
      },
      /**
       * Makes `key`'s value again, and keeps it: whether it's another than the one last made
       * (one that failed, then or now, is another; one never made isn't).
       */
      changed: async (key: string, make: () => Promise<T>) => {
        const entry = entries.get(key);
        const before = entry?.value ?? entry?.last;
        const now = put(key, make);
        if (!before) {
          return false;
        }
        const [was, is] = await Promise.all(
          [before, now].map((made) =>
            made.then(
              (value) => ({ value }),
              () => undefined,
            ),
          ),
        );
        return !(was && is && same(was.value, is.value));
      },
    });
  };

  return {
    of,
    /**
     * A cache of one value (a project has one: its support files' list, their Storybook steps),
     * made by `make`: no key, and nothing to say at each ask.
     */
    single: <T>({
      make,
      same,
    }: {
      make: () => Promise<T>;
      same?: (a: T, b: T) => boolean;
    }) => {
      const cache = of<T>({ same });
      const key = "value";
      /** The value: made at the first ask (and the first after `clear()`), the same from then on. */
      const value = () => cache(key, make);
      return Object.assign(value, {
        /** Makes the value again, and keeps it: whether it's another than the one last made. */
        changed: () => cache.changed(key, make),
      });
    },
    /** Keeps `thing` out of `clear()`: `dispose()` empties it. */
    keep: <T extends { clear(): void }>(thing: T) => {
      kept.push(thing);
      return thing;
    },
    /** Has every cache make its values again at their next ask. */
    clear,
    /** Forgets everything: the caches, and what was kept. */
    dispose: () => {
      for (const cache of caches) {
        cache.forget();
      }
      for (const thing of kept) {
        thing.clear();
      }
    },
  };
};
