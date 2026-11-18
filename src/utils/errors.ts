// The plugin's own errors (`pluginError`, `quietError`, `unsupportedError`), each message prefixed
// with the plugin's name (`pluginErrorMessage`). Three kinds: a user's or environment's error says
// what's wrong and has no stack (`quiet`: no frame would be the user's); a user's call at the wrong
// time keeps its stack, the call among its frames (Vitest's frame filter keeps an error whose first
// frame is the plugin's whole); an `internal` one, a bug of the plugin's, keeps its stack and asks to
// be reported. Page-safe.

const prefix = "@lotun/vitest-cucumber: ";

/** Where the plugin's bugs are reported. */
const issues = "https://github.com/lotun-io/vitest-cucumber/issues";

/** The plugin's message: `message`, prefixed with its name. */
export const pluginErrorMessage = (message: string) => `${prefix}${message}`;

/** The plugin's message for a bug of its own: `message`, asking to report it. */
export const internalErrorMessage = (message: string) =>
  pluginErrorMessage(
    `${message} (a bug in @lotun/vitest-cucumber, please report it: ${issues})`,
  );

/**
 * An error with no stack, only its message (and `options`, e.g. a cause): no frame would be the
 * user's. Its stack is `""`: an own property in every engine (Firefox's `stack` is an accessor on
 * `Error.prototype`, so `delete` would bring the frames back), still a string as the types say.
 */
export const quietError = (message: string, options?: ErrorOptions) => {
  const error = new Error(message, options);
  error.stack = "";
  return error;
};

/**
 * The plugin's error: its message prefixed (`pluginErrorMessage`), its `cause` if any; `quiet`, no
 * stack (`quietError`: a user's or environment's error, no frame would be the user's); `internal`, a
 * bug of the plugin's: its stack, and its message asking to report it (`internalErrorMessage`).
 */
export const pluginError = (
  message: string,
  {
    cause,
    quiet = false,
    internal = false,
  }: { cause?: unknown; quiet?: boolean; internal?: boolean } = {},
) => {
  const options = cause === undefined ? undefined : { cause };
  if (internal) {
    return new Error(internalErrorMessage(message), options);
  }
  return quiet
    ? quietError(pluginErrorMessage(message), options)
    : new Error(pluginErrorMessage(message), options);
};

/** The plugin's error for a part of cucumber's API it doesn't support, in every mode (its call's stack). */
export const unsupportedError = (name: string) =>
  pluginError(`${name} isn't supported`);
