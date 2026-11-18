// The preview annotation the preset adds in Storybook's own preview (its dev server or a static build:
// cucumber runs in the page, needing no server; story tests get `../vitest/annotation.ts`). It sets the
// page's runner (`./runner.ts`), and its `beforeAll` (Storybook's project hook) loads the support code
// and runs cucumber's BeforeAll hooks before any story renders, whichever story plays, returning the
// AfterAll hooks as its cleanup: once per page (the cleanup only when Storybook re-initializes its
// annotations in place, never on a reload or a closed tab). Preview only.
import { setRunner } from "../story.ts";
import { runner } from "./runner.ts";

setRunner(runner);

/** Storybook's project `beforeAll`: cucumber's BeforeAll hooks, and its AfterAll hooks as cleanup. */
export const beforeAll = async () => {
  await runner.beforeAll();
  return () => runner.afterAll();
};
