import { createRequire } from "node:module";
import { expect, test } from "vitest";
import { cucumberExports } from "../cucumberExports.ts";
import { lazyReplacement } from "../replacement.ts";

const require = createRequire(import.meta.url);

const found = cucumberExports();
if (!found) {
  throw new Error("cucumber's exports can't be read");
}
const { file } = found.required;

/** Whether cucumber's own code is loaded in this worker (more than an entry for its file). */
const cucumberLoaded = () =>
  Object.keys(require.cache).some(
    (id) => id !== file && /@cucumber[\\/]cucumber[\\/]lib[\\/]/.test(id),
  );

/** The plugin's own exports, here: three of them. */
const own = {
  Given: "the plugin's Given",
  version: "the plugin's version",
  HookTarget: "the plugin's HookTarget",
};

/** What a `require` of cucumber gets now. */
const required = () => require("@cucumber/cucumber") as Record<string, unknown>;

test("never read past the plugin's own: cucumber's code isn't loaded, and its entry is as it was after", () => {
  expect(cucumberLoaded()).toBe(false);
  const replacement = lazyReplacement(own, found);
  expect(required().Given).toBe("the plugin's Given");
  replacement.restore();
  expect(cucumberLoaded()).toBe(false);
  expect(file in require.cache).toBe(false);
});

/** The replacement the next three tests share, made by the first (after the test above). */
let replacement: ReturnType<typeof lazyReplacement> | undefined;
const imported = () => {
  if (!replacement) {
    throw new Error("no replacement");
  }
  return replacement.exports as Record<string, unknown>;
};

test("an import's exports and a `require`'s: each its own entry's names with the plugin's own, the plugin's own without cucumber", () => {
  replacement = lazyReplacement(own, found);
  // An import: its ES module entry's names, and what the plugin has of its own (`HookTarget`,
  // which that entry lacks).
  expect(Object.keys(imported()).toSorted()).toEqual(
    [...new Set([...found.imported, "HookTarget"])].toSorted(),
  );
  expect(imported()).toMatchObject(own);
  // A `require`: its CommonJS entry's names; marked as a compiled module, as cucumber's is.
  expect(Object.keys(required()).toSorted()).toEqual(
    found.required.names.toSorted(),
  );
  expect(required()).toMatchObject(own);
  expect(required().__esModule).toBe(true);
  expect(cucumberLoaded()).toBe(false);
});

test("an export only cucumber has, read: its code loaded then, the same either way; a `require` still gets the replacement while the support code loads", () => {
  const formatter = imported().Formatter;
  expect(cucumberLoaded()).toBe(true);
  expect(typeof formatter).toBe("function");
  expect(required().Formatter).toBe(formatter);
  expect(required().Given).toBe("the plugin's Given");
  expect(typeof imported().supportCodeLibraryBuilder).toBe("object");
});

test("the support code loaded: a `require` is cucumber's own, what the support code got still the replacement's, a later read of it changes nothing", () => {
  replacement?.restore();
  expect(typeof required().Given).toBe("function");
  expect(required().Formatter).toBe(imported().Formatter);
  expect(imported().Given).toBe("the plugin's Given");
  expect(typeof imported().JsonFormatter).toBe("function");
  expect(typeof required().Given).toBe("function");
});
