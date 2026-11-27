import { expect, test } from "vitest";
import { asRelative } from "../asRelative.ts";

test("a path as Storybook writes a relative one: `./` before it unless it starts with `./` or `../`", () => {
  expect(asRelative("src/Card.stories.tsx")).toBe("./src/Card.stories.tsx");
  expect(asRelative("./src/Card.stories.tsx")).toBe("./src/Card.stories.tsx");
  expect(asRelative("../shared/Card.stories.tsx")).toBe(
    "../shared/Card.stories.tsx",
  );
  // A folder named with a dot isn't relative by its dot.
  expect(asRelative(".design/Card.stories.tsx")).toBe(
    "./.design/Card.stories.tsx",
  );
  expect(asRelative("..design/Card.stories.tsx")).toBe(
    "./..design/Card.stories.tsx",
  );
  expect(asRelative("Card.stories.tsx")).toBe("./Card.stories.tsx");
});
