// The installed cucumber's export names, read without loading it, each way it's loaded:
// - an `import`'s: its ES module entry (its `package.json`'s `exports`: `import`, else `default`,
//   as Node resolves it), a flat list of its exports, each `export const Given = cucumber.Given;`
//   (13.3.0's `lib/wrapper.mjs`, written by hand: it has no `HookTarget`);
// - a `require`'s: its CommonJS entry (`lib/index.js`, compiled from cucumber's `index.ts`), whose
//   exports TypeScript declares first, on one line (`exports.Given = exports.When = … = void 0;`),
//   and whether it's marked as a compiled ES module (`__esModule`).
// Read from the files' text, so the names are the installed version's, whatever it adds or drops.
// A file written another way isn't one this can read: nothing is guessed, there are no names, and
// node mode loads cucumber first, as it did (`./replacement.ts`). Node only.
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);

/** An ES module entry's own import of the CommonJS build (`import cucumber from './index.js'`). */
const importLine = /^import \w+ from ["'][^"']+["'];?$/;
/** One of its exports, by its name on both sides (`export const Given = cucumber.Given`). */
const exportLine = /^export const (\w+) = \w+\.(\w+);?$/;

/**
 * The export names of an ES module entry written as cucumber's (`text`), in its order; none if it
 * has none, or a statement that isn't one of its exports.
 */
export const esmExportNamesOf = (text: string): string[] | undefined => {
  const names: string[] = [];
  for (const line of text.split("\n")) {
    const statement = line.trim();
    if (
      statement === "" ||
      statement.startsWith("//") ||
      importLine.test(statement)
    ) {
      continue;
    }
    const [, name, from] = exportLine.exec(statement) ?? [];
    if (name === undefined || name !== from) {
      return undefined;
    }
    names.push(name);
  }
  return names.length > 0 ? names : undefined;
};

/** TypeScript's declaration of a CommonJS module's exports (`exports.a = exports.b = void 0;`). */
const declaredLine = /^exports\.\w+(?: = exports\.\w+)* = void 0;$/gm;
/** An export given its value: assigned, or defined as a getter. */
const givenExport =
  /^(?:exports\.(\w+) =|Object\.defineProperty\(exports, "(\w+)")/gm;

/**
 * The exports of a CommonJS entry compiled by TypeScript (`text`): the names it declares, and
 * whether it's marked `__esModule`. None if it declares none, re-exports another module whole
 * (`export *`: names this can't see), or gives a value to an export it didn't declare.
 */
export const cjsExportsOf = (
  text: string,
): { names: string[]; esModule: boolean } | undefined => {
  const names = [...text.matchAll(declaredLine)].flatMap(([line]) =>
    [...line.matchAll(/exports\.(\w+)/g)].flatMap(([, name]) => name ?? []),
  );
  const given = [...text.matchAll(givenExport)].flatMap(
    ([, assigned, defined]) => assigned ?? defined ?? [],
  );
  const known = new Set([...names, "__esModule"]);
  return names.length === 0 ||
    text.includes("__exportStar(") ||
    given.some((name) => !known.has(name))
    ? undefined
    : { names, esModule: given.includes("__esModule") };
};

/** The installed cucumber's exports, each way it's loaded. */
export interface CucumberExports {
  /** What an `import` of it has: its ES module entry's names. */
  imported: string[];
  /** What a `require` of it has: the file it loads, that entry's names, whether it's marked `__esModule`. */
  required: { file: string; names: string[]; esModule: boolean };
}

/**
 * The installed cucumber's exports, read from its two entries as Node resolves them; none if it
 * can't be resolved either way (no `require` in its `exports`, no `import.meta.resolve` here), or
 * an entry isn't written as expected.
 */
export const cucumberExports = (): CucumberExports | undefined => {
  try {
    const file = require.resolve("@cucumber/cucumber");
    const entry = fileURLToPath(import.meta.resolve("@cucumber/cucumber"));
    const imported = esmExportNamesOf(readFileSync(entry, "utf8"));
    const required = cjsExportsOf(readFileSync(file, "utf8"));
    return imported && required
      ? { imported, required: { file, ...required } }
      : undefined;
  } catch {
    return undefined;
  }
};
