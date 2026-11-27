import path from "node:path";
import { expect, test } from "vitest";
import { importPathOf } from "../importPath.ts";

test("a file's import path in Storybook's index: from its working directory, as Storybook writes it", () => {
  const cwd = process.cwd();
  expect(importPathOf(path.join(cwd, "src", "Card.stories.tsx"))).toBe(
    "./src/Card.stories.tsx",
  );
  // A folder named with a dot: `./` before it too.
  expect(importPathOf(path.join(cwd, ".design", "Card.stories.tsx"))).toBe(
    "./.design/Card.stories.tsx",
  );
  // Outside it: `../`, as it is.
  expect(
    importPathOf(path.join(path.dirname(cwd), "shared", "Card.stories.tsx")),
  ).toBe(`../shared/Card.stories.tsx`);
});
