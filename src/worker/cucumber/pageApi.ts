// The page's `@cucumber/cucumber/api` and `@cucumber/cucumber/lib/…`: cucumber's runner, which the
// page doesn't have (it runs the plugin's own copy of cucumber's runtime). Importing it throws, with
// the reason. It exports the API's names (cucumber 13.3.0's `lib/api/index.ts`), so that a named
// import of one links and the import fails with that reason, not the browser's "does not provide an
// export named …" (a named import of another `lib/…` module still gets the browser's).
import type * as Api from "@cucumber/cucumber/api";
import { pluginError } from "../../utils/errors.ts";

const unavailable = (): never => {
  throw pluginError(
    "cucumber's API (`@cucumber/cucumber/api`, `@cucumber/cucumber/lib/…`) isn't available in browser mode (the page runs the plugin's own copy of cucumber's runtime)",
    { quiet: true },
  );
};

unavailable();

export const loadConfiguration: typeof Api.loadConfiguration = unavailable;
export const loadSources: typeof Api.loadSources = unavailable;
export const loadSupport: typeof Api.loadSupport = unavailable;
export const runCucumber: typeof Api.runCucumber = unavailable;
