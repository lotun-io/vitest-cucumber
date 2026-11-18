// A scenario's Vitest worker, while this repository's coverage collects its subprocesses'
// (`coverage.autoAttachSubprocess`, see `../support/config.ts`, which adds it to their `execArgv`):
// Vitest stops it with SIGTERM, which ends it without Node writing its coverage
// (`NODE_V8_COVERAGE`); a normal exit instead. Outside `../support/`: not the outer suite's.
// eslint-disable-next-line n/no-process-exit -- the point: a normal exit, its coverage written.
process.once("SIGTERM", () => process.exit());
