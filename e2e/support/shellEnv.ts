// The environment of a command the steps run as a shell would (`storybook build`, `storybook dev`,
// native cucumber): this process's, without Vitest's own variables. Vitest sets them in its workers
// (`VITEST`, `VITEST_POOL_ID`, …, and `NODE_ENV=test`): with them, Storybook's build acts as in a
// Vitest run, not as a user's.

/** This process's environment without `VITEST*` and `NODE_ENV`. */
export const shellEnv = () =>
  Object.fromEntries(
    Object.entries(process.env).filter(
      ([name]) => !name.startsWith("VITEST") && name !== "NODE_ENV",
    ),
  );
