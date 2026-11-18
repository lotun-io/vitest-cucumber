// The preview annotation the preset adds in story tests (the addon's Vitest runs load the project's
// annotations; Storybook's own preview gets `../preview/annotation.ts`). It sets the page's runner
// (`./runner.ts`). No `beforeAll`: the worker fixture runs cucumber's BeforeAll and AfterAll, as for
// feature files (`./tests.ts`).
import { setRunner } from "../story.ts";
import { runner } from "./runner.ts";

setRunner(runner);
