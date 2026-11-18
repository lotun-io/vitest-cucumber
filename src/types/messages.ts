// The run's Cucumber Messages as workers and pages send them to main
// (`../worker/platform/createPlatform.ts`), which puts each run's in order, every project's in one
// stream (`../core/runs/runReport.ts`). Page-safe.
import type { Envelope } from "@cucumber/messages";

/**
 * A batch of the run's messages, as a worker or page made them, each as cucumber's: its support
 * code's (`support`: every worker and page sends
 * its own, the stream has each once), or a run's of it (a BeforeAll or AfterAll run, a scenario's
 * attempt), passed on as they are.
 */
export interface MessageBatch {
  support: boolean;
  envelopes: readonly Envelope[];
}
