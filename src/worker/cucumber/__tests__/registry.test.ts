import { afterEach, expect, test } from "vitest";
import { record, recordWrapper, registry } from "../registry.ts";

afterEach(() => {
  registry.calls.length = 0;
  registry.wrapper = undefined;
  registry.loaded = false;
});

test("each call as made: its method, its arguments as they are, and its stack", () => {
  const code = () => undefined;
  const options = { timeout: 5 };
  record("Given")("a step", options, code);
  const [call] = registry.calls;
  expect(call?.method).toBe("Given");
  expect(call?.args[1]).toBe(options);
  expect(call?.args[2]).toBe(code);
  expect(call?.stack).toContain("registry.test.ts");
});

test("in order", () => {
  record("Before")(() => undefined);
  record("setDefaultTimeout")(1000);
  expect(registry.calls.map(({ method }) => method)).toEqual([
    "Before",
    "setDefaultTimeout",
  ]);
});

test("a call once the support code has loaded fails, with its method's name", () => {
  registry.loaded = true;
  expect(() => record("Given")("a step", () => undefined)).toThrow(
    '[@lotun/vitest-cucumber] "Given" was called after the support code loaded',
  );
  expect(() => recordWrapper((code: unknown) => code)).toThrow(
    '[@lotun/vitest-cucumber] "setDefinitionFunctionWrapper" was called after the support code loaded',
  );
  expect(registry.calls).toEqual([]);
  expect(registry.wrapper).toBeUndefined();
});
