// The page's `@cucumber/cucumber/api` and `@cucumber/cucumber/lib/…`: cucumber's runner, which the
// page doesn't have (it runs the plugin's own copy of cucumber's runtime). Importing it throws, with
// the reason.
import { pluginError } from "../../utils/errors.ts";

throw pluginError(
  "cucumber's API (`@cucumber/cucumber/api`, `@cucumber/cucumber/lib/…`) isn't available in browser mode (the page runs the plugin's own copy of cucumber's runtime)",
  { quiet: true },
);

export {};
