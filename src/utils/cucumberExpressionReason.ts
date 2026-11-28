// Why cucumber refuses a cucumber expression, in a line: its error's reason (the line after its
// pointer, `^`), as the plugin's messages quote it. The rest of cucumber's message quotes the
// expression as it was compiled, which in Storybook's hosts is the step's with its placeholders
// rewritten (`{string}`): not what the user wrote. The Storybook steps' scan's
// (`../core/storybook/stories/storybookSteps.ts`) and a step definition's
// (`../worker/runner/supportCode.ts`). Anywhere.

/**
 * Whether `error` is cucumber-expressions' for an expression it can't parse: its class isn't
 * exported (and has no `name` of its own), its message always starts so (its `Errors.js`).
 */
export const isCucumberExpressionError = (error: unknown): error is Error =>
  error instanceof Error &&
  /^This Cucumber Expression has a problem at column \d+:/.test(error.message);

/** `error`'s reason (cucumber-expressions' `CucumberExpressionError`), else its first line. */
export const cucumberExpressionReason = (error: unknown) => {
  const lines = (error instanceof Error ? error.message : String(error)).split(
    "\n",
  );
  const pointer = lines.findIndex((line) => /^\s*\^/.test(line));
  return (pointer === -1 ? undefined : lines[pointer + 1]) ?? lines[0] ?? "";
};
