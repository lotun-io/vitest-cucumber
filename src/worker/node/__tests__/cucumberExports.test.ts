import { createRequire } from "node:module";
import { expect, test } from "vitest";
import {
  cjsExportsOf,
  cucumberExports,
  esmExportNamesOf,
} from "../cucumberExports.ts";

const require = createRequire(import.meta.url);

// On a cucumber update: if this fails, an entry is written another way than the readers expect
// (node mode then loads cucumber first, as it did before: nothing breaks, the saving is gone).
test("the installed cucumber's exports, read from its two entries: exactly what an `import` and a `require` of it have", async () => {
  const found = cucumberExports();
  expect(found).toBeDefined();
  const imported = Object.keys(await import("@cucumber/cucumber"));
  expect(found?.imported.toSorted()).toEqual(imported.toSorted());
  const file = require.resolve("@cucumber/cucumber");
  const required: unknown = require(file);
  expect(found?.required).toEqual({
    file,
    names: expect.any(Array),
    esModule: true,
  });
  expect(found?.required.names.toSorted()).toEqual(
    Object.keys(required as object).toSorted(),
  );
  // What cucumber's ES module entry forgot (13.3.0): the plugin gives its own.
  expect(found?.required.names).toContain("HookTarget");
  expect(found?.imported).not.toContain("HookTarget");
});

test("an ES module entry written as cucumber's: its names, in order; any other statement, or no export: none", () => {
  const entry = [
    "import cucumber from './index.js';",
    "",
    "// Support code",
    "export const Given = cucumber.Given;",
    "export const version = cucumber.version",
    "//# sourceMappingURL=data:application/json;base64,e30=",
    "",
  ].join("\n");
  expect(esmExportNamesOf(entry)).toEqual(["Given", "version"]);
  for (const other of [
    "export * from './index.js';",
    "export function Given() {}",
    "export const Given = cucumber.When;",
    "export { Given } from './index.js';",
    "const loaded = load();",
  ]) {
    expect(esmExportNamesOf(`${entry}${other}\n`)).toBeUndefined();
  }
  expect(
    esmExportNamesOf("import cucumber from './index.js';\n"),
  ).toBeUndefined();
  expect(esmExportNamesOf("")).toBeUndefined();
});

test("a CommonJS entry compiled by TypeScript: the names it declares, and its `__esModule`; one that declares none, re-exports a module whole, or gives a value to another name: none", () => {
  const entry = [
    '"use strict";',
    'Object.defineProperty(exports, "__esModule", { value: true });',
    "exports.Given = exports.World = void 0;",
    "exports.version = void 0;",
    'var world_1 = require("./world");',
    'Object.defineProperty(exports, "World", { enumerable: true, get: function () { return world_1.default; } });',
    "exports.Given = methods.Given;",
    'exports.version = "1.0.0";',
    "",
  ].join("\n");
  expect(cjsExportsOf(entry)).toEqual({
    names: ["Given", "World", "version"],
    esModule: true,
  });
  expect(
    cjsExportsOf(
      entry.replace(/^Object\.defineProperty\(exports, "__esModule".*\n/m, ""),
    ),
  ).toEqual({ names: ["Given", "World", "version"], esModule: false });
  expect(
    cjsExportsOf(`${entry}exports.When = methods.When;\n`),
  ).toBeUndefined();
  expect(
    cjsExportsOf(
      `${entry}Object.defineProperty(exports, "Then", { value: 1 });\n`,
    ),
  ).toBeUndefined();
  expect(
    cjsExportsOf(`${entry}__exportStar(require("./more"), exports);\n`),
  ).toBeUndefined();
  expect(cjsExportsOf("module.exports = { Given };\n")).toBeUndefined();
});
