// Cucumber's compatibility kit: how each sample is expected to fare, per mode. The generated feature
// files (`./generate.ts`) turn these into tags: a known difference is an `@knownFailure`
// example (it passes while it fails, and fails once fixed: then remove it here), a sample left out
// is `@leftOut` (skipped), its reason the feature's description.

/** A mode a sample runs in (e2e's: `e2e/support/project.ts`). */
export type Mode = "node" | "browser" | "storybook";

export const modes: readonly Mode[] = ["node", "browser", "storybook"];

/**
 * Samples left out, with why: cucumber-js leaves out the first three too (its `cck_spec.ts`). It
 * leaves out two more, which run here: `all-statuses` (as any sample), and
 * `global-hooks-attachments`, whose BeforeAll and AfterAll fail in cucumber 13.3 (their `this` has
 * no `attach`) and fail the same way in the plugin: once cucumber gives them one, it differs.
 */
export const leftOut: Record<string, string> = {
  "pending-exception":
    "cucumber signals pending by a return value, not an exception",
  "skipped-exception":
    "cucumber signals skipped by a return value, not an exception",
  "test-run-exception":
    "its `--error` argument is the reference implementation's (cucumber has none)",
  "multiple-features-reversed": "file order is Vitest's (`--order reverse`)",
};

/** Known differences, by sample and mode, with why: e2e's `@knownFailure`. */
export const knownFailures: Record<string, Partial<Record<Mode, string>>> = {};
