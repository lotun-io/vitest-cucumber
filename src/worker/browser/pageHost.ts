// A Vitest page's pieces (browser mode's page, Storybook's story tests), on what every Vitest host
// shares (`../platform/vitest/vitestHost.ts`): its support code imported given main's version of
// cucumber, its worker variables on the page's `import.meta.env`, where each call was made asked of
// main (source-mapped: `Actions["locate"]`), its errors as Vitest serializes them with their BigInts
// as text (its browser RPC is JSON), and its command to main. Page-safe.
/// <reference types="vite/client" />
import { inject } from "vitest";
import type { Host } from "../../types/platform.ts";
import type {} from "../../types/providedContext.ts";
import type { ModeEnvironment } from "../../types/runtimeEnvironment.ts";
import { bigIntsAsText } from "../platform/errors/bigIntsAsText.ts";
import { vitestThrown } from "../platform/errors/serializedErrors.ts";
import { vitestHost } from "../platform/vitest/vitestHost.ts";
import { command } from "./command.ts";
import { importPageSupport } from "./importPageSupport.ts";

/**
 * The page's `import.meta.env`, through a variable: Vite would replace a literal
 * `import.meta.env.<name>` at build time.
 */
const env = import.meta.env;

/** A Vitest page's pieces, its runtime on `environment`. */
export const pageHost = (environment: () => ModeEnvironment): Host =>
  vitestHost({
    env,
    importSupport: (importSupport) =>
      importPageSupport(inject("vitestCucumber").version, importSupport),
    locate: (stacks) => command("locate", { stacks }),
    // As Vitest serializes them; its browser RPC is JSON: BigInts as text.
    throwable: vitestThrown(bigIntsAsText),
    environment,
    command,
  });
