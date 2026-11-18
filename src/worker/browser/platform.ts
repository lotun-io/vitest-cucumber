// Browser mode's `Platform`, imported by every feature module in the page: the shared one
// (`../platform/createPlatform.ts`) on a Vitest page's pieces (`./pageHost.ts`), cucumber running in
// the page. Its support code loads once per page, in the run main provided (its worker id the tab's
// pool id). Page-safe.
import { createPlatform } from "../platform/createPlatform.ts";
import { pageHost } from "./pageHost.ts";
import { createRuntimeEnvironment } from "./runtimeEnvironment.ts";

export const platform = createPlatform(pageHost(createRuntimeEnvironment));
