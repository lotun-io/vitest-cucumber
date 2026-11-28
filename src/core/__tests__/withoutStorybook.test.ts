import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { expect, test } from "vitest";

// Storybook is an optional peer: a node or browser mode project, without it, must never load it.
// Every module those modes load, from the plugin's entry: its imports (static, re-exported or
// dynamic, its types aside) and the modules it gives workers and pages by path (`ownModule`),
// and theirs, none importing Storybook. ESLint keeps each import so (`eslint.config.ts`); this
// checks what's reached.

const src = path.resolve(import.meta.dirname, "../..");

/** The relative modules `file` loads (not for types) and the ones it names by path, and its packages. */
const loadsOf = (file: string) => {
  const code = readFileSync(file, "utf8");
  const specifiers = [
    ...code.matchAll(
      /^\s*(?:import|export)\s+(?!type\b)(?:[^;]*?\sfrom\s+)?["']([^"']+)["']/gm,
    ),
    ...code.matchAll(/\bimport\(\s*["']([^"']+)["']\s*\)/g),
  ].map(([, specifier = ""]) => specifier);
  const byPath = [
    ...code.matchAll(/\bownModule\(\s*["']([^"']+)["']\s*\)/g),
  ].map(([, module = ""]) => path.join(src, `${module}.ts`));
  return {
    modules: [
      ...specifiers
        .filter((specifier) => specifier.startsWith("."))
        .map((specifier) => path.resolve(path.dirname(file), specifier)),
      ...byPath,
    ].filter((module) => existsSync(module)),
    packages: specifiers.filter((specifier) => !specifier.startsWith(".")),
  };
};

/** Every module reached from `entry`, and the packages each imports. */
const reachedFrom = (entry: string) => {
  const packages = new Map<string, string[]>();
  const todo = [entry];
  for (let file = todo.pop(); file !== undefined; file = todo.pop()) {
    if (packages.has(file)) {
      continue;
    }
    const loads = loadsOf(file);
    packages.set(file, loads.packages);
    todo.push(...loads.modules);
  }
  return packages;
};

test("node and browser mode load no module importing Storybook, nor Storybook's own modules", () => {
  const reached = reachedFrom(path.join(src, "index.ts"));
  const relative = (file: string) =>
    path.relative(src, file).replaceAll("\\", "/");
  // The walk reaches what node and browser mode run: the plugin, its workers' and pages' modules.
  expect([...reached.keys()].map(relative)).toEqual(
    expect.arrayContaining([
      "core/nodePlugin.ts",
      "core/browserPlugin.ts",
      "worker/feature/workerFixture.ts",
      "worker/browser/pageHost.ts",
    ]),
  );
  expect(
    [...reached].flatMap(([file, imports]) =>
      imports
        .filter((name) => /^(storybook|@storybook\/)/.test(name))
        .map((name) => `${relative(file)}: ${name}`),
    ),
  ).toEqual([]);
  expect(
    [...reached.keys()]
      .map(relative)
      .filter(
        (file) =>
          file.startsWith("core/storybook/") ||
          file === "core/storybookPlugin.ts",
      ),
  ).toEqual([]);
});
