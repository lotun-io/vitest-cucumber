// The runs' Cucumber Messages, for the scenarios that collect them (`../steps/messages.ts`, the
// compatibility kit's): the harness subscribes to the stream of each Vitest it runs, through the
// plugin's own test runs (`src/core/runs/testRuns.ts`, no public API). The nested Vitests load the
// plugin by Node from `src/` (the scenarios' `node_modules` link to this package), as this process
// does (the repository's config externalizes `src/`): one module, the same test runs. Never in watch
// mode (the plugin makes no stream there).
import type { Envelope } from "@cucumber/messages";
import type { Reporter, Vitest } from "vitest/node";
import { testRunsOf } from "../../src/core/runs/testRuns.ts";

/** `vitest`'s runs' messages into `messages`, from its next run on: the returned function stops. */
export const collectMessages = (vitest: Vitest, messages: Envelope[]) =>
  testRunsOf(vitest).subscribe((envelope) => messages.push(envelope));

/**
 * A reporter collecting its Vitest's runs' messages into `messages` (for a Vitest that runs as it
 * starts: `startVitest`): subscribed as Vitest starts its reporters (`onInit`, once per Vitest, after
 * the plugins made its test runs), before its run. Not a plugin: a root plugin's `configureVitest`
 * runs for each project inheriting it (a browser's instances: subscribed twice), and for none in a
 * config whose projects have their own.
 */
export const collectingReporter = (messages: Envelope[]): Reporter => ({
  onInit: (vitest) => {
    collectMessages(vitest, messages);
  },
});
