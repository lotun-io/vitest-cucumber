// A worker's id in the run's Cucumber Messages (`testCaseStarted`, `testRunHookStarted`): its number
// (`CUCUMBER_WORKER_ID`, counted per project) with its project's name, so a run's one stream, every
// project's in it (`../../core/runs/testRuns.ts`), tells each worker apart and which project ran each
// test case. An unnamed project (the root of a config without projects) is alone in its run: its
// number alone, as cucumber writes it. Page-safe.

/** Worker `workerId` of project `projectName`, as the messages name it (`1 [in-node]`). */
export const workerLabel = (workerId: string, projectName: string) =>
  projectName ? `${workerId} [${projectName}]` : workerId;
