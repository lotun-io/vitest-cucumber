import { describe, expect, test } from "vitest";
import { formatSourceReference } from "../formatting.ts";
import { stylerOf } from "../style.ts";
import { CUCUMBER_THEME } from "../theme.ts";

describe("formatSourceReference", () => {
  const plain = stylerOf({ colors: false });

  test("a definition's location, as it is (its path already the plugin's, with `/`)", () => {
    expect(
      formatSourceReference(
        { uri: "features/support/steps.ts", location: { line: 4 } },
        CUCUMBER_THEME,
        plain,
      ),
    ).toBe("# features/support/steps.ts:4");
  });

  test("without a file or a line, as pretty-formatter writes it", () => {
    expect(formatSourceReference({}, CUCUMBER_THEME, plain)).toBe(
      "# (unknown)",
    );
  });

  test("in the theme's color for locations", () => {
    expect(
      formatSourceReference(
        { uri: "a.ts" },
        CUCUMBER_THEME,
        stylerOf({ colors: true }),
      ),
    ).toBe("\u001b[90m# a.ts\u001b[39m");
  });
});
