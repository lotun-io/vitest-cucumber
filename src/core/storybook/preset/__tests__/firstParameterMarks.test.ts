import { SourceMap } from "node:module";
import { minify, parseSync, transformWithEsbuild } from "vite";
import { describe, expect, test, vi } from "vitest";
import type { Plugin } from "vitest/config";
import type { Code } from "../../../../types/supportCode.ts";
import { firstParameterStatement } from "../../../../utils/firstParameterMark.ts";
import { slash } from "../../../../utils/slash.ts";
import {
  cucumbers,
  worldFirst,
} from "../../../../worker/runner/__tests__/firstParameterFunctions.ts";
import { takesFirst } from "../../../../worker/runner/thisFirst.ts";
import { ownModule } from "../../../utils/ownModule.ts";
import { firstParameterMarks, markedCode } from "../firstParameterMarks.ts";

/** `code` parsed as the bundler's plugins get it (Vite's parser). */
const parse = (code: string) => parseSync("module.js", code).program;

/** `code` with its statements (as it is, if it gets none). */
const marked = (code: string) =>
  markedCode(code, parse(code))?.toString() ?? code;

/** What `expression`'s code evaluates to. */
const valueOf = (expression: string): unknown =>
  new Function(`return (${expression})`)();

/**
 * The minifiers a Vite build has: Rolldown's (Vite 8's), esbuild's (Vite 6.4's and 7's). Each
 * takes a script (its top level's names are kept: `result` is read back) and renames what's inside.
 */
const minifiers = {
  rolldown: async (code: string) =>
    (await minify("module.js", code, { module: false })).code,
  // A project's own setting: reading a property does nothing (the statement is a call).
  "rolldown, told that a property's read does nothing": async (code: string) =>
    (
      await minify("module.js", code, {
        module: false,
        compress: { treeshake: { propertyReadSideEffects: false } },
      })
    ).code,
  esbuild: async (code: string) =>
    (await transformWithEsbuild(code, "module.js", { minify: true })).code,
};

/** What `expression` evaluates to once a build has marked it and `minifier` minified it. */
const built = async (
  expression: string,
  minifier: keyof typeof minifiers,
): Promise<unknown> => {
  const code = await minifiers[minifier](
    marked(`var result = (${expression});`),
  );
  return new Function(`${code};return result`)();
};

// Vite says `transformWithEsbuild` is deprecated, each time: not this test's to tell.
vi.spyOn(console, "warn").mockImplementation(() => undefined);

const world = firstParameterStatement("world");
const context = firstParameterStatement("context");

describe("the statement, as it's written", () => {
  test("first in a block's body", () => {
    expect(marked("(world, count) => { return count; }")).toBe(
      `(world, count) => {${world} return count; }`,
    );
    expect(marked("async (world) => {}")).toBe(`async (world) => {${world}}`);
    expect(marked("world => { world.log(); }")).toBe(
      `world => {${world} world.log(); }`,
    );
  });

  test("after the body's directives, which stay the first statements", () => {
    expect(
      marked('(world) => { "use server"; "use strict"; return world; }'),
    ).toBe(`(world) => { "use server"; "use strict";${world} return world; }`);
  });

  test("after a directive written without its `;`, one first: the code still parses, the directive still one", () => {
    const code = marked('(world) => { "use strict"\n  return world; }');
    expect(code).toBe(`(world) => { "use strict";${world}\n  return world; }`);
    const fn = valueOf(code) as (value: unknown) => unknown;
    expect(fn(1)).toBe(1);
  });

  test("after several directives written without their `;`, after the last: each still a directive", () => {
    const code = marked(
      '(world) => {\n  "use server"\n  "use strict"\n  return world;\n}',
    );
    expect(code).toBe(
      `(world) => {\n  "use server"\n  "use strict";${world}\n  return world;\n}`,
    );
    const fn = valueOf(code) as (value: unknown) => unknown;
    expect(fn(1)).toBe(1);
    // Still directives: `"use strict"` makes the function strict (`this` not the global object).
    const strict = valueOf(
      marked(
        '(world) => {\n  "use server"\n  "use strict"\n  return (function () { return this; })();\n}',
      ),
    ) as (value: unknown) => unknown;
    expect(strict(1)).toBeUndefined();
  });

  test("a module deeper than the call stack: marked all the same", () => {
    // A left-deep chain: each `+` a level of the tree (a call per level overflowed at ~5,000).
    const chain = Array.from(
      { length: 20_000 },
      (_, index) => `a${String(index)}`,
    );
    const code = `const step = (world) => world;\nconst sum = ${chain.join(" + ")};`;
    expect(marked(code)).toMatch(
      `const step = (world) =>{${world}return ( world);}`,
    );
  });

  test("an expression becomes a block that returns it, in parentheses", () => {
    expect(marked("(world, count) => world + count")).toBe(
      `(world, count) =>{${world}return ( world + count);}`,
    );
    expect(marked("(world) => ({ items: world })")).toBe(
      `(world) =>{${world}return ( ({ items: world }));}`,
    );
    // A `return` before a line break would return nothing.
    expect(marked("(world) =>\n  world.items")).toBe(
      `(world) =>{${world}return (\n  world.items);}`,
    );
  });

  test("after the arrow, a comment's `=>` before it none: the comment as written", () => {
    expect(marked("(world /* => */) => world.go()")).toBe(
      `(world /* => */) =>{${world}return ( world.go());}`,
    );
    expect(marked("(world, // => the World\n) => world.go()")).toBe(
      `(world, // => the World\n) =>{${world}return ( world.go());}`,
    );
  });

  test("a test run hook's `context`", () => {
    expect(marked("(context) => {}")).toBe(`(context) => {${context}}`);
  });

  test("each function its own: one in another's body, one that is another's body", () => {
    expect(marked("(world) => { return (context) => {}; }")).toBe(
      `(world) => {${world} return (context) => {${context}}; }`,
    );
    expect(marked("(world) => (context) => [world, context]")).toBe(
      `(world) =>{${world}return ( (context) =>{${context}return ( [world, context]);});}`,
    );
  });

  test("wherever it's written in a module: a step's, a helper's export", () => {
    const code = [
      'import { Given } from "@cucumber/cucumber";',
      'Given("a step", async (world) => { await world.attach("a"); });',
      "export const helper = (world, text) => { world.log(text); };",
      "export const other = (cart) => cart;",
      "export function plain(world) { return world; }",
    ].join("\n");
    expect(marked(code)).toBe(
      [
        'import { Given } from "@cucumber/cucumber";',
        `Given("a step", async (world) => {${world} await world.attach("a"); });`,
        `export const helper = (world, text) => {${world} world.log(text); };`,
        "export const other = (cart) => cart;",
        "export function plain(world) { return world; }",
      ].join("\n"),
    );
  });

  test("a module with none is left as it is", () => {
    const code = "export const world = { context: 1 };";
    expect(markedCode(code, parse(code))).toBeUndefined();
  });

  test("its map gives a place after it its place as written", () => {
    const code = "const step = (world, count) => world.add(count);";
    const result = markedCode(code, parse(code));
    const map = new SourceMap(
      JSON.parse(String(result?.generateMap({ hires: true }))),
    );
    const entry = map.findEntry(0, String(result).indexOf("world.add"));
    expect(entry).toMatchObject({
      originalLine: 0,
      originalColumn: code.indexOf("world.add"),
    });
  });
});

describe.each(Object.keys(minifiers) as (keyof typeof minifiers)[])(
  "minified by %s, read by the runtime",
  (minifier) => {
    test("the functions the runtime's pattern reads as written, and no other", async () => {
      for (const text of [...worldFirst, ...cucumbers]) {
        const written = valueOf(text) as Code;
        expect(
          takesFirst((await built(text, minifier)) as Code, "world"),
          text,
        ).toBe(takesFirst(written, "world"));
      }
    });

    test("a test run hook's `context`", async () => {
      const hook = (await built("(context) => {}", minifier)) as Code;
      expect(takesFirst(hook, "context")).toBe(true);
      expect(takesFirst(hook, "world")).toBe(false);
    });

    test("the function does what it did: a block, an expression, an object, a line break", async () => {
      const add = (await built(
        "(world, count) => { return world + count; }",
        minifier,
      )) as (world: number, count: number) => number;
      expect(add(1, 2)).toBe(3);
      expect(add).toHaveLength(2);
      expect(takesFirst(add as Code, "world")).toBe(true);
      const sum = (await built(
        "(world, count) => world + count",
        minifier,
      )) as typeof add;
      expect(sum(1, 2)).toBe(3);
      expect(takesFirst(sum as Code, "world")).toBe(true);
      const object = (await built(
        "(world) => ({ items: world })",
        minifier,
      )) as (world: number) => object;
      expect(object(1)).toEqual({ items: 1 });
      expect(takesFirst(object as Code, "world")).toBe(true);
      const broken = (await built(
        "(world) =>\n  world.items",
        minifier,
      )) as (world: { items: number }) => number;
      expect(broken({ items: 2 })).toBe(2);
    });

    test("an async function, and one with a directive", async () => {
      const later = (await built(
        "async (world, count) => (await world) + count",
        minifier,
      )) as (world: Promise<number>, count: number) => Promise<number>;
      await expect(later(Promise.resolve(1), 2)).resolves.toBe(3);
      expect(takesFirst(later as Code, "world")).toBe(true);
      const directed = (await built(
        '(world) => { "use server"; return world; }',
        minifier,
      )) as Code;
      expect(takesFirst(directed, "world")).toBe(true);
      expect(String(directed)).toContain("use server");
    });

    test("a function in another: each read for itself", async () => {
      const outer = (await built(
        "(count) => (world) => [count, world]",
        minifier,
      )) as (count: number) => Code;
      expect(takesFirst(outer as Code, "world")).toBe(false);
      expect(takesFirst(outer(1), "world")).toBe(true);
      const both = (await built(
        "(world) => (context) => [world, context]",
        minifier,
      )) as (world: number) => Code;
      expect(takesFirst(both as Code, "world")).toBe(true);
      expect(takesFirst(both(1), "context")).toBe(true);
      expect(takesFirst(both(1), "world")).toBe(false);
    });
  },
);

describe("the modules marked", () => {
  const plugin: Plugin = firstParameterMarks();
  const parsed = vi.fn(parse);
  /** The plugin's transform of module `id` (its `code`), parsing with Vite's parser. */
  const transform = (code: string, id: string) => {
    const hook = plugin.transform;
    if (typeof hook !== "function") {
      throw new Error("The plugin's transform is a function");
    }
    return Reflect.apply(hook, { parse: parsed }, [code, id]) as
      { code: string; map: { mappings: string } } | undefined;
  };
  const step = "export const step = (world) => world;";

  test("a build's only, after the other transforms", () => {
    expect(plugin.apply).toBe("build");
    expect(plugin.enforce).toBe("post");
  });

  test("the project's own modules, with a map", () => {
    const result = transform(step, "/project/features/steps.ts");
    expect(result?.code).toContain(world);
    expect(result?.map.mappings).not.toBe("");
    expect(transform(step, "/project/helpers/step.js?v=1")?.code).toContain(
      world,
    );
  });

  test("a package's modules: steps a support file imports from one", () => {
    expect(
      transform(step, "/project/node_modules/steps/dist/index.js")?.code,
    ).toContain(world);
  });

  test("not the plugin's own modules, nor a module that isn't a script", () => {
    expect(
      transform(step, slash(ownModule("worker/storybook/feature"))),
    ).toBeUndefined();
    expect(transform(step, "/project/src/Cart.feature")).toBeUndefined();
  });

  test("a module the bundler's parser refuses is left as it is", () => {
    const hook = plugin.transform;
    if (typeof hook !== "function") {
      throw new Error("The plugin's transform is a function");
    }
    const refusing = {
      parse: () => {
        throw new SyntaxError("'return' outside of function");
      },
    };
    expect(
      Reflect.apply(hook, refusing, [
        "const context = 1;\nreturn;",
        "/project/node_modules/legacy/index.js",
      ]),
    ).toBeUndefined();
  });

  test("a module naming neither parameter isn't parsed", () => {
    parsed.mockClear();
    expect(
      transform("export const step = (cart) => cart;", "/project/steps.ts"),
    ).toBeUndefined();
    expect(parsed).not.toHaveBeenCalled();
  });
});
