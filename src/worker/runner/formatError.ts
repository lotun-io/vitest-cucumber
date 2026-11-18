// A failed result's `message` and `exception`, after cucumber's `formatError` (13.3.0's
// `lib/runtime/format_error.ts`): the error's type and its message. Unlike cucumber's, nothing
// deeper: no stack, no causes, no assertion diff (the messages are the
// compatibility kit's and the e2e suite's only, which compare neither). Vitest reports the real error
// itself. Page-safe.
import type { Exception } from "@cucumber/messages";

/**
 * `error`'s result details: a string (cucumber's own errors, e.g. a wrong arity) or an Error, its
 * type and message (no stack).
 */
export const formatSimpleError = (
  error: Error | string,
): { message: string; exception: Exception } => {
  if (typeof error === "string") {
    return {
      message: `Error: ${error}`,
      exception: { type: "Error", message: error },
    };
  }
  return {
    message: `${error.name}: ${error.message}`,
    exception: { type: error.constructor.name, message: error.message },
  };
};
