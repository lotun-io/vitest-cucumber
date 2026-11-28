// The plugin's own errors (`pluginError`, `quietError`, `locatedError`, `locatedErrors`, `unsupportedError`), each message prefixed
// with the plugin's name (`pluginErrorMessage`). Three kinds: a user's or environment's error says
// what's wrong and has no stack (`quiet`: no frame would be the user's); a user's call at the wrong
// time keeps its stack, the call among its frames (Vitest's frame filter keeps an error whose first
// frame is the plugin's whole); an `internal` one, a bug of the plugin's, keeps its stack and asks to
// be reported. Page-safe.

const prefix = "[@lotun/vitest-cucumber] ";

/** Where the plugin's bugs are reported. */
const issues = "https://github.com/lotun-io/vitest-cucumber/issues";

/** The plugin's message: `message`, prefixed with its name. */
export const pluginErrorMessage = (message: string) => `${prefix}${message}`;

/** Whether `error` is one of the plugin's own (its message prefixed: `pluginErrorMessage`). */
export const isPluginError = (error: unknown): error is Error =>
  error instanceof Error && error.message.startsWith(prefix);

/** The plugin's message for a bug of its own: `message`, asking to report it. */
export const internalErrorMessage = (message: string) =>
  pluginErrorMessage(
    `${message} (a bug in @lotun/vitest-cucumber, please report it at ${issues})`,
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

/**
 * What a located error says: its sentence (what's wrong, then what to do), and each place in the
 * user's files it refers to (`path:line[:column]` from the project's root), in a stack's order:
 * what it points to first, the line it comes from last.
 */
export interface Located {
  message: string;
  at: readonly string[];
}

/** `places`, each on a line of its own, indented `indent`. */
const placesText = (places: readonly string[], indent: string) =>
  places.map((place) => `\n${indent}${place}`).join("");

/**
 * The plugin's error about places in the user's files: its message, then each place on a line of
 * its own, indented, like a stack's frames; no stack (its frames would be the plugin's). The
 * messages' standard: `notes/design.md`, "Error messages".
 */
export const locatedError = (message: string, at: readonly string[]) =>
  pluginError(`${message}${placesText(at, "  ")}`, { quiet: true });

/**
 * The plugin's error for several located errors (`items`) under `header`: each as `  - ` and its
 * message, its places under it; one written twice, listed once.
 */
export const locatedErrors = (header: string, items: readonly Located[]) => {
  const lines = items.map(
    ({ message, at }) => `  - ${message}${placesText(at, "    ")}`,
  );
  return pluginError([header, ...new Set(lines)].join("\n"), { quiet: true });
};

/** The plugin's error for a part of cucumber's API a browser page can't have (its call's stack). */
export const unsupportedError = (name: string) =>
  pluginError(`${name} isn't supported in a browser page`);
