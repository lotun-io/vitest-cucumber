// While an async call runs (it returned a promise, or takes a callback), an uncaught error (the
// window's `error`) fails it, as cucumber's `uncaughtException` listener does in node mode: no
// listener for a synchronous call or a rejection (cucumber has none), and while ours is attached
// Vitest doesn't report the error itself (it counts the page's `error` listeners). Page-safe.
import { createUncaught } from "../runner/uncaught.ts";

/** The page's window (`globalThis`), as far as its `error` listeners go; none in Node. */
const page = globalThis as {
  addEventListener?: (
    type: "error",
    listener: (event: { error?: unknown }) => void,
  ) => void;
  removeEventListener?: (
    type: "error",
    listener: (event: { error?: unknown }) => void,
  ) => void;
};

/**
 * The page's `uncaught` (`../runner/uncaught.ts`): the window's `error` (its `addEventListener`,
 * which Vitest counts; not `once`, which it never counts down). An event without an error (e.g. a
 * ResizeObserver loop's) isn't one, so a `throw null` from a timer isn't either (cucumber fails its
 * step; a page can't tell it from those). In Node (the unit tests) there's no window: nothing heard.
 */
export const createUncaughtErrors = () =>
  createUncaught((fail) => {
    if (!page.addEventListener || !page.removeEventListener) {
      return undefined;
    }
    const { addEventListener, removeEventListener } = page;
    const onError = (event: { error?: unknown }) => {
      if (event.error !== undefined && event.error !== null) {
        fail(event.error);
      }
    };
    addEventListener.call(page, "error", onError);
    return () => {
      removeEventListener.call(page, "error", onError);
    };
  });
