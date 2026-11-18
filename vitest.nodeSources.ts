// This repository's fix of Vitest's v8 coverage for the plugin's modules (see `./vitest.config.ts`).
// They run as Node loads them (`server.deps.external`, its types stripped, their positions kept),
// but coverage maps each file through its server's transform of it, Vite's (other positions:
// counts on other lines). For them, the server's `ssr` environment transforms as Node does: Vitest's
// runner never fetches them (external), so only coverage gets it. A page runs them as Node does too
// (`client`: Node's stripping, not Vite's TypeScript transform): with Vite's, a page's copy of a
// file never merged with Node's (its map leaves each function's end unmapped, column `null`, and
// the report keys a function by its start and end), so each function counted twice, once uncovered.
// The stripping is `amaro`'s, the library Node strips types with (`stripTypeScriptTypes` of
// `node:module` is the same, but experimental: it warns as it's first called).
import { slash } from "@vitest/utils/helpers";
import { transformSync } from "amaro";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import type { Plugin } from "vitest/config";

/** `code` without its types, as Node strips them (types as spaces, positions kept). */
const stripTypeScriptTypes = (code: string) =>
  transformSync(code, { mode: "strip-only" }).code;

/** `url`'s file, with `/` (as Vite's ids): without its query, a `file:` URL's path. */
const fileOf = (url: string) => {
  const [pathname = ""] = url.split("?");
  return slash(
    pathname.startsWith("file://") ? fileURLToPath(pathname) : pathname,
  );
};

export const nodeSources = (directory: string): Plugin => {
  // With `/`, as Vite's ids: on Windows a directory made with `node:path` has `\\`, and matched
  // no module (a page then got Vite's transform, its functions and branches counted twice).
  const sources = new RegExp(
    `^${RegExp.escape(slash(directory))}.*\\.[cm]?ts$`,
  );
  /** Whether `file` is one of the plugin's TypeScript modules. */
  const isSource = (file: string) => sources.test(file);
  return {
    name: "node-sources",
    // Before Vite's own transforms: a page gets Node's stripping (types as spaces, positions kept).
    enforce: "pre",
    // Vite's TypeScript transform leaves them alone (plain JavaScript by then), React Refresh's too:
    // React's plugin has it run on every `*.[tj]sx?` (`jsxRefreshInclude`), despite `exclude`. Only
    // where Refresh is on, after the other plugins' config: an exclude without an include has it run
    // on everything else, CSS too.
    config: {
      order: "post",
      handler: ({ oxc }) => ({
        oxc: {
          exclude: sources,
          ...(oxc &&
            oxc.jsxRefreshInclude !== undefined && {
              jsxRefreshExclude: [
                ...[oxc.jsxRefreshExclude ?? []].flat(),
                sources,
              ],
            }),
        },
      }),
    },
    transform(code, id) {
      if (this.environment.name !== "client" || !isSource(fileOf(id))) {
        return undefined;
      }
      return { code: stripTypeScriptTypes(code), map: null };
    },
    configureServer(server) {
      const environment = server.environments.ssr;
      if (!environment) {
        return;
      }
      const { transformRequest } = environment;
      environment.transformRequest = async function (url, ...rest) {
        const file = fileOf(url);
        if (isSource(file)) {
          return {
            code: stripTypeScriptTypes(await readFile(file, "utf8")),
            map: null,
          };
        }
        return transformRequest.call(this, url, ...rest);
      };
    },
  };
};
