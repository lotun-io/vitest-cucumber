// The plugin's setup file, first in every project's `setupFiles` (`../../core/plugin/createPlugin.ts`'s
// `configureVitest`): what the plugin needs done in a worker or a page before the project's own
// setup files run. Today: the host's timers and clock saved, before a setup file can fake them
// (`../runner/realTimers.ts`). Page-safe.
import { saveRealTimers } from "../runner/realTimers.ts";

saveRealTimers();
