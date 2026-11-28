// The environment variables cucumber's parallel workers get, set for the support code before it
// loads: in node mode on `process.env`, in a page on `import.meta.env`
// (`../worker/platform/createPlatform.ts`); in Storybook's own preview, written into every module's
// `import.meta.env` as it's built (`../core/storybook/preset/previewPlugin.ts`). Page-safe.

/**
 * The variables for worker `workerId` (Vitest's pool id: 1 to `totalWorkers`, unique among a
 * project's workers or pages running at once) in a run of at most `totalWorkers` at once (Vitest's
 * `maxWorkers`), as cucumber's parallel workers have them (a `RunWorker`'s).
 */
export const workerEnvironment = ({
  workerId,
  totalWorkers,
}: {
  workerId: string;
  totalWorkers: number;
}) => ({
  CUCUMBER_PARALLEL: "true",
  CUCUMBER_TOTAL_WORKERS: String(totalWorkers),
  CUCUMBER_WORKER_ID: workerId,
});

/** Storybook's own preview: one page, one worker (no Vitest). */
export const previewWorker = { workerId: "1", totalWorkers: 1 };
