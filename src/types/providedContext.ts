// What main provides to each project's Vitest workers (Vitest's `provide` and `inject`).
declare module "vitest" {
  interface ProvidedContext {
    /**
     * The plugin's values. `colors`: whether Vitest's output has colors, for cucumber's summaries,
     * which both modes build where they run (node mode's workers, browser mode's pages: see
     * `../worker/platform/summary/summary.ts`).
     */
    vitestCucumber: {
      colors: boolean;
      /** Vitest's `maxWorkers`, for cucumber's `CUCUMBER_TOTAL_WORKERS`. */
      totalWorkers: number;
      /**
       * The project's `isolate`: each worker or page runs one file, so AfterAll runs in that file's
       * own `afterAll`, its errors the file's as BeforeAll's (`../worker/feature/workerFixture.ts`).
       */
      isolate: boolean;
      /** Cucumber's version, main's: the page's stand-in reports it (it has none of its own). */
      version: string;
      /**
       * The project's tags whose Vitest definition sets a `timeout`: a scenario with one keeps
       * Vitest's timeout, from its tags (`../worker/platform/scenario/scenarioTestOptions.ts`).
       */
      timedTags: string[];
      /**
       * The project's Vitest `testTimeout` and `hookTimeout` (resolved: 5 s and 10 s, a browser's 15 s
       * and 30 s, unless the config sets them; 0 none): cucumber's default timeouts, unless the
       * support code sets one (`../worker/platform/vitest/vitestTimeouts.ts`).
       */
      testTimeout: number;
      hookTimeout: number;
      /**
       * The plugin's and its runtime's cucumber packages' directories (with `/`): node mode's
       * definition locations skip their frames (`../utils/locateStacks.ts`).
       */
      internalDirectories: string[];
      /**
       * The project's name (`""`: the root of a config without projects): the run's messages name
       * their worker after it (`../worker/platform/workerLabel.ts`), and a node worker's commands
       * their project (main's server answers for it: `../core/commands/server.ts`).
       */
      projectName: string;
      /**
       * Whether workers and pages send the run's Cucumber Messages to main: someone subscribed to
       * the run's stream (set as each run starts: `../core/runs/testRuns.ts`; `false` before any).
       */
      sendMessages: boolean;
      /**
       * Node mode's commands to main (`../worker/node/command.ts`): the command server's port and
       * token (every request's; each names its project, `projectName`). Its port 0 in a page (its
       * commands are Vitest's browser command).
       */
      command: { port: number; token: string };
    };
  }
}

export {};
