import { expect, test } from "vitest";
import { pluginError, quietError, unsupportedError } from "../errors.ts";

test("a plugin error: its message prefixed, its stack, its cause", () => {
  const cause = new Error("why");
  const error = pluginError("something", { cause });
  expect(error.message).toBe("@lotun/vitest-cucumber: something");
  expect(error.stack).toContain("errors.test.ts");
  expect(error.cause).toBe(cause);
});

test("quiet (a user's or environment's error): no stack", () => {
  const error = pluginError("something", { quiet: true });
  expect(error.stack).toBe("");
  expect(quietError("plain").stack).toBe("");
});

test("internal (a bug of the plugin's): its stack, its message asking to report it", () => {
  const error = pluginError("something", { internal: true, quiet: true });
  expect(error.message).toBe(
    "@lotun/vitest-cucumber: something (a bug in @lotun/vitest-cucumber, please report it: https://github.com/lotun-io/vitest-cucumber/issues)",
  );
  expect(error.stack).toContain("errors.test.ts");
});

test("unsupported: the user's call keeps its stack", () => {
  const error = unsupportedError("setDefaultTimeout");
  expect(error.message).toBe(
    "@lotun/vitest-cucumber: setDefaultTimeout isn't supported",
  );
  expect(error.stack).toContain("errors.test.ts");
});
