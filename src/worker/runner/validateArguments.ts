// Cucumber's validation of a definition's arguments (13.3.0's
// `lib/support_code_library_builder/validate_arguments.ts`): its checks, in its order, for each kind
// of definition; the messages are the plugin's (`locatedError`: what's wrong, then the call's
// location on a line of its own). Its options check refuses `null` too: cucumber's
// `typeof options === "object"` lets it by and its next check reads `options.timeout`, a bare
// TypeError (`Given("x", null, fn)`, `Before(null, fn)`); cucumber's types take an object or a
// function. One check is the plugin's own: a BeforeAll or AfterAll hook's
// `on` is `"WORKER"` (Vitest's workers run them; a `"COORDINATOR"` hook, once per run, has no
// coordinator to run it). Page-safe.
import { locatedError } from "../../utils/errors.ts";

type Args = {
  code?: unknown;
  pattern?: unknown;
  options?: Record<string, unknown>;
};

interface Validation {
  predicate(args: Args): boolean;
  /** What's wrong with a call to `method` (`Given`, `Before`, …) with `args`. */
  message(method: string, args: Args): string;
}

/** The options argument (`argument`: which one); `tags`: a string of tags may be given instead. */
const optionsValidation = (argument: string, tags = false): Validation => ({
  predicate: ({ options }) => typeof options === "object" && options !== null,
  message: (method) =>
    `${method}'s ${argument} argument should be its options (an object)${tags ? ", its tags (a string)" : ""} or its code (a function)`,
});

const optionsTimeoutValidation: Validation = {
  predicate: ({ options }) =>
    options?.timeout == null || typeof options.timeout === "number",
  message: (method) =>
    `${method}'s timeout option should be a number of milliseconds`,
};

const fnValidation = (argument: string): Validation => ({
  predicate: ({ code }) => typeof code === "function",
  message: (method) =>
    `${method}'s ${argument} argument should be its code (a function)`,
});

const tagsValidation: Validation = {
  predicate: ({ options }) =>
    options?.tags == null || typeof options.tags === "string",
  message: (method) =>
    `${method}'s tags option should be a tag expression (a string)`,
};

/** The plugin's: a test run hook runs in each worker (cucumber's default, `on` left out, too). */
const onWorkerValidation: Validation = {
  predicate: ({ options }) => options?.on == null || options.on === "WORKER",
  message: (method, { options }) =>
    options?.on === "COORDINATOR"
      ? `${method}({ on: "COORDINATOR" }) isn't supported, use Vitest's globalSetup for once-per-run setup`
      : `${method}'s on option can only be "WORKER"`,
};

const validations = {
  defineTestRunHook: [
    optionsValidation("first"),
    optionsTimeoutValidation,
    onWorkerValidation,
    fnValidation("second"),
  ],
  defineTestCaseHook: [
    optionsValidation("first", true),
    tagsValidation,
    optionsTimeoutValidation,
    fnValidation("second"),
  ],
  defineTestStepHook: [
    optionsValidation("first", true),
    tagsValidation,
    optionsTimeoutValidation,
    fnValidation("second"),
  ],
  defineStep: [
    {
      predicate: ({ pattern }) =>
        pattern instanceof RegExp || typeof pattern === "string",
      message: (method) =>
        `${method}'s first argument should be its expression (a string or a regular expression)`,
    },
    optionsValidation("second"),
    optionsTimeoutValidation,
    fnValidation("third"),
  ],
} satisfies Record<string, Validation[]>;

/**
 * Throws the plugin's error for the first invalid argument of a call to `method` (a definition of
 * kind `fnName`), at `location` (the call's `path:line`).
 */
export const validateArguments = ({
  args,
  fnName,
  method,
  location,
}: {
  args: Args;
  fnName: keyof typeof validations;
  method: string;
  location: string;
}) => {
  for (const { predicate, message } of validations[fnName]) {
    if (!predicate(args)) {
      throw locatedError(message(method, args), [location]);
    }
  }
};
