// Node mode's `Platform`, imported by every feature module in the Vitest worker: the shared one
// (`../platform/createPlatform.ts`) on node mode's pieces, cucumber running in the worker. Its
// support code loads once per worker: the run's id main's, its worker id Vitest's pool id, its
// worker variables on `process.env`, loaded with the plugin's replacement of `@cucumber/cucumber`
// while it loads and cucumber itself after (`./replacement.ts`), each call located from its stack
// (`./locate.ts`). With `isolate: false` several feature files share the worker and its support code.
import { createPlatform } from "../platform/createPlatform.ts";
import { vitestThrown } from "../platform/errors/serializedErrors.ts";
import { vitestHost } from "../platform/vitest/vitestHost.ts";
import { command } from "./command.ts";
import { locate } from "./locate.ts";
import { loadWithReplacement } from "./replacement.ts";
import { createRuntimeEnvironment } from "./runtimeEnvironment.ts";

/** The worker's platform. */
export const platform = createPlatform(
  vitestHost({
    env: process.env,
    // As Vitest serializes them (V8 carries BigInts).
    throwable: vitestThrown(),
    importSupport: loadWithReplacement,
    locate,
    environment: createRuntimeEnvironment,
    command,
  }),
);
