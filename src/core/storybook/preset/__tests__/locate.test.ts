import path from "node:path";
import { expect, test } from "vitest";
import { createLocator, type DevServer } from "../locate.ts";

const root = path.resolve("/project");
const steps = path.join(root, "features/steps.ts");
const shared = path.resolve("/shared/steps.ts");
/** The plugin's own recorder, as the page's stack has it (a file the dev server serves by `/@fs/`). */
const recorder = path.resolve("src/worker/cucumber/registry.ts");

/** A served module whose code's line 1, column 0 is its source's line 4, column 0. */
const servedAs = (id: string) => ({
  id,
  transformResult: {
    code: "",
    map: {
      version: 3,
      sources: [path.basename(id)],
      names: [],
      mappings: "AAGA",
    },
  },
});
/** A module's id, as Vite's module graph has it: its path with `/`. */
const idOf = (file: string) => file.replaceAll("\\", "/");
const modules = new Map([
  [idOf(steps), servedAs(idOf(steps))],
  [idOf(shared), servedAs(idOf(shared))],
]);

/**
 * The dev server (only what the locator reads): `/features/steps.ts` by its URL (Vite drops `?t=`
 * itself), `/shared/…` by file.
 */
const server = {
  config: { cacheDir: path.join(root, "node_modules/.vite") },
  environments: {
    client: {
      moduleGraph: {
        getModuleById: (id: string) => modules.get(id),
        getModuleByUrl: (url: string) =>
          Promise.resolve(
            url.split("?")[0] === "/features/steps.ts"
              ? modules.get(idOf(steps))
              : undefined,
          ),
        getModulesByFile: (file: string) => {
          const served = modules.get(file);
          return served ? new Set([served]) : undefined;
        },
      },
    },
  },
} as unknown as DevServer;

/** The dev server's URL of a file outside its root, as Vite writes it: `/@fs/` and its path with `/`. */
const fsUrl = (file: string) =>
  `http://localhost:6006/@fs/${file.replaceAll("\\", "/").replace(/^\//, "")}`;

/** A recorded stack: the recorder, then the support code's call at `url`. */
const stackAt = (url: string) =>
  ["Error", `    at ${fsUrl(recorder)}:24:51`, `    at ${url}`].join("\n");

const locate = (stacks: (string | undefined)[]) =>
  createLocator(server, root)({ id: 7, stacks });

test("each stack's first frame that isn't the plugin's, its module found by Vite, mapped", async () => {
  expect(
    await locate([
      stackAt("http://localhost:6006/features/steps.ts?t=1730800000000:1:1"),
      undefined,
    ]),
  ).toEqual({
    id: 7,
    locations: [{ uri: "features/steps.ts", line: 4, column: 1 }, undefined],
  });
});

test("a file served from outside the root (`/@fs/`): found by its path", async () => {
  expect((await locate([stackAt(`${fsUrl(shared)}:1:1`)])).locations).toEqual([
    { uri: "../shared/steps.ts", line: 4, column: 1 },
  ]);
});

test("a frame of a module the dev server didn't serve: as it is", async () => {
  expect(
    (await locate([stackAt(`${fsUrl(path.join(root, "other.ts"))}:3:2`)]))
      .locations,
  ).toEqual([{ uri: "other.ts", line: 3, column: 2 }]);
});
