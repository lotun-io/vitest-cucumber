import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { expect, test } from "vitest";
import { ownModule } from "../ownModule.ts";

const src = path.join(import.meta.dirname, "..", "..", "..");

/** Every `.ts` file under `dir`. */
const sources = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory()
      ? sources(path.join(dir, entry.name))
      : entry.name.endsWith(".ts")
        ? [path.join(dir, entry.name)]
        : [],
  );

// The plugin names its own modules by path in strings, which the typecheck can't follow: a module
// moved or renamed leaves a name that loads nothing.
test("every module the plugin names by path (`ownModule`) exists", () => {
  const names = sources(src).flatMap((file) =>
    [...readFileSync(file, "utf8").matchAll(/ownModule\("([^"]+)"\)/g)].map(
      ([, name]) => name as string,
    ),
  );
  expect(names.length).toBeGreaterThan(0);
  expect(names.filter((name) => !existsSync(ownModule(name)))).toEqual([]);
});
