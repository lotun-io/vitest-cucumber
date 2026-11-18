// Storybook's preview in `storybook dev`: where its support code calls were made, as browser mode's
// (`../../../utils/locateStacks.ts`: each stack's first frame that isn't the plugin's, its
// path from the project's root). The page sends its recorded stacks
// (`../../../worker/storybook/preview/locate.ts`) to Storybook's dev server, which parses them as Vitest
// parses a browser page's (`project.browser.parseStacktrace`), on its own module graph: each frame's
// module found by Vite (`getModuleByUrl`, the URL handling Vite's own: its timestamp and import
// queries, its resolution; a `/@fs/` file, which the parser gives as its path, by `getModulesByFile`),
// asked first (it's async, the parser's lookups aren't), and its source map as Vitest finds it (a copy
// of `@vitest/browser` 5.1.0's `ParentBrowserProject` `getSourceMap`); none of Vitest's default ignored
// frames, as browser mode's (`../../commands/locate.ts`).
import { parseStacktrace } from "@vitest/utils/source-map";
import { extractSourcemapFromFile } from "@vitest/utils/source-map/node";
import path from "node:path";
import type { TestProject } from "vitest/node";
import type {
  LocateRequest,
  LocateResponse,
} from "../../../types/storybook.ts";
import { locateStacks } from "../../../utils/locateStacks.ts";
import { internalDirectories } from "../../plugin/frames.ts";
import { withoutQuery } from "../../utils/withoutQuery.ts";

/**
 * Vite's dev server, as Vitest's types give it (a project's `vite`): the plugin has no dependency on
 * `vite` itself (its type declarations would name it).
 */
export type DevServer = TestProject["vite"];

/**
 * A copy of Vitest's `getSourceMap`: a module's source map (the one on disk if the pipeline's isn't
 * usable). The client environment's module graph, where Vitest's reads the server's mixed one (Vite's
 * backward-compatible graph, to be deprecated): the same module's transform result.
 */
const sourceMapsOf = (vite: DevServer) => {
  const sourceMapCache = new Map<string, unknown>();
  return (id: string) => {
    if (sourceMapCache.has(id)) {
      return sourceMapCache.get(id);
    }
    const result =
      vite.environments.client.moduleGraph.getModuleById(id)?.transformResult;
    const [filePath = id] = id.split("?");
    // The map on disk when the pipeline's isn't usable: a pre-bundled dependency's (its map resolves
    // into the optimizer's cache), or an empty one.
    if (
      result &&
      (!result.map ||
        result.map.mappings === "" ||
        filePath.startsWith(vite.config.cacheDir))
    ) {
      const extracted = extractSourcemapFromFile(result.code, filePath) as
        { map: unknown } | undefined;
      if (extracted || !result.map?.mappings) {
        sourceMapCache.set(id, extracted?.map);
        return extracted?.map;
      }
    }
    return result?.map;
  };
};

/** The module id of a frame's file (its URL's path, or a `/@fs/` file's path), if Vite served it. */
const moduleIdOf = async (vite: DevServer, file: string) => {
  const graph = vite.environments.client.moduleGraph;
  const served = await graph.getModuleByUrl(file).catch(() => undefined);
  if (served?.id) {
    return served.id;
  }
  return (
    graph.getModulesByFile(withoutQuery(file))?.values().next().value?.id ??
    undefined
  );
};

/** Storybook's dev server's locator: its answer to the page's request, each stack's location. */
export const createLocator = (vite: DevServer, root: string) => {
  const getSourceMap = sourceMapsOf(vite);
  return async ({
    id,
    stacks,
  }: LocateRequest): Promise<
    Extract<LocateResponse, { locations: unknown }>
  > => {
    // Each frame's module, asked first: the parser's lookups are synchronous.
    const files = new Set(
      stacks.flatMap((stack) =>
        stack === undefined
          ? []
          : parseStacktrace(stack, { ignoreStackEntries: [] }).map(
              ({ file }) => file,
            ),
      ),
    );
    const moduleIds = new Map<string, string>();
    for (const file of files) {
      const moduleId = await moduleIdOf(vite, file);
      if (moduleId) {
        moduleIds.set(file, moduleId);
      }
    }
    return {
      id,
      locations: locateStacks(
        (stack) =>
          parseStacktrace(stack, {
            ignoreStackEntries: [],
            getUrlId: (file) => moduleIds.get(file) ?? file,
            getSourceMap,
          }),
        stacks,
        { internalDirectories, relative: (file) => path.relative(root, file) },
      ),
    };
  };
};
