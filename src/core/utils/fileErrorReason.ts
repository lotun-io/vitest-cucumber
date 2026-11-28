// Why Node couldn't read a file, as the plugin's messages quote it: its message without the path
// it names at its end (`ENOENT: no such file or directory, open '/abs/a.feature'`: absolute, the
// error's place says which file). A feature file's (`../feature/plans.ts`), a support file's
// (`../storybook/stories/supportSteps.ts`). Main's.

/** `error`'s reason, its path left out. */
export const fileErrorReason = (error: unknown) =>
  (error instanceof Error ? error.message : String(error)).replace(
    /, \w+ '[^']*'$/,
    "",
  );
