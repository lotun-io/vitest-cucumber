// Cucumber's validation of a definition's arguments (a copy of 13.3.0's
// `lib/support_code_library_builder/validate_arguments.ts`): the page builds its support code itself
// (`./supportCode.ts`), with cucumber's messages for a call it refuses. One of the plugin's own, in
// cucumber's form: a BeforeAll or AfterAll hook's `on` is `"WORKER"` (Vitest's workers run them; a
// `"COORDINATOR"` hook, once per run, has no coordinator to run it).

type Args = {
  code?: unknown;
  pattern?: unknown;
  options?: Record<string, unknown>;
};

interface Validation {
  identifier: string;
  expectedType: string;
  predicate(args: Args): boolean;
  /** What the error says after the identifier, if not `should be a <expectedType>` (the plugin's). */
  reason?: string;
}

const optionsValidation = {
  expectedType: "object or function",
  predicate: ({ options }: Args) => typeof options === "object",
};

const optionsTimeoutValidation: Validation = {
  identifier: '"options.timeout"',
  expectedType: "integer",
  predicate: ({ options }) =>
    options?.timeout == null || typeof options.timeout === "number",
};

const fnValidation = {
  expectedType: "function",
  predicate: ({ code }: Args) => typeof code === "function",
};

const tagsValidation: Validation = {
  identifier: '"options.tags"',
  expectedType: "string",
  predicate: ({ options }) =>
    options?.tags == null || typeof options.tags === "string",
};

/** The plugin's: a test run hook runs in each worker (cucumber's default, `on` left out, too). */
const onWorkerValidation: Validation = {
  identifier: '"options.on"',
  expectedType: '"WORKER"',
  predicate: ({ options }) => options?.on == null || options.on === "WORKER",
  reason: `"COORDINATOR" isn't supported, BeforeAll and AfterAll hooks run in each Vitest worker`,
};

const validations: Record<string, Validation[]> = {
  defineTestRunHook: [
    { identifier: "first argument", ...optionsValidation },
    optionsTimeoutValidation,
    onWorkerValidation,
    { identifier: "second argument", ...fnValidation },
  ],
  defineTestCaseHook: [
    { identifier: "first argument", ...optionsValidation },
    tagsValidation,
    optionsTimeoutValidation,
    { identifier: "second argument", ...fnValidation },
  ],
  defineTestStepHook: [
    { identifier: "first argument", ...optionsValidation },
    tagsValidation,
    optionsTimeoutValidation,
    { identifier: "second argument", ...fnValidation },
  ],
  defineStep: [
    {
      identifier: "first argument",
      expectedType: "string or regular expression",
      predicate: ({ pattern }) =>
        pattern instanceof RegExp || typeof pattern === "string",
    },
    { identifier: "second argument", ...optionsValidation },
    optionsTimeoutValidation,
    { identifier: "third argument", ...fnValidation },
  ],
};

/** Throws cucumber's error for the first invalid argument of a call to `fnName`, at `location`. */
export const validateArguments = ({
  args,
  fnName,
  location,
}: {
  args: Args;
  fnName: keyof typeof validations;
  location: string;
}) => {
  for (const { identifier, expectedType, predicate, reason } of validations[
    fnName
  ] ?? []) {
    if (!predicate(args)) {
      throw new Error(
        `${location}: Invalid ${identifier}: ${reason ?? `should be a ${expectedType}`}`,
      );
    }
  }
};
