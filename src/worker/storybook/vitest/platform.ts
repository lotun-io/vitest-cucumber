// The story tests' platform (the addon's Vitest project): a Vitest page's pieces
// (`../../browser/pageHost.ts`: locating through Vitest's browser command), each
// step's code a step of the story (`../story.ts`). Its support code: a feature module's
// (`./tests.ts`'s `storyTestsModule`). Page-safe.
import { pageHost } from "../../browser/pageHost.ts";
import { createPlatform } from "../../platform/createPlatform.ts";
import { storyEnvironment } from "../story.ts";

export const platform = createPlatform(pageHost(storyEnvironment));
