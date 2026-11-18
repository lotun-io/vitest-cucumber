import { expect, test } from "vitest";
import { checkWorldParameters } from "../worldParameters.ts";

/** The error `checkWorldParameters` throws for `worldParameters`. */
const errorOf = (worldParameters: unknown) => {
  try {
    checkWorldParameters(worldParameters);
  } catch (error) {
    return error;
  }
  return undefined;
};

test("values JSON.stringify takes: nothing to say", () => {
  expect(errorOf(undefined)).toBeUndefined();
  expect(errorOf({ url: "http://a", list: [1, { two: [2] }] })).toBeUndefined();
});

test("a value JSON.stringify refuses: the plugin's error, JSON.stringify's its cause", () => {
  const parameters: Record<string, unknown> = {};
  parameters.self = parameters;
  for (const [value, cause] of [
    [{ limit: 10n }, "Do not know how to serialize a BigInt"],
    [parameters, "Converting circular structure to JSON"],
  ] as const) {
    expect(errorOf(value)).toMatchObject({
      message:
        "@lotun/vitest-cucumber: the worldParameters config option can't be converted to JSON",
      cause: expect.objectContaining({
        message: expect.stringContaining(cause) as unknown,
      }) as unknown,
    });
  }
});

test("the cause: the error the user's code threw (a toJSON's, a getter's), its stack with it", () => {
  const thrown = new Error("not ready");
  expect(
    errorOf({
      at: {
        toJSON() {
          throw thrown;
        },
      },
    }),
  ).toMatchObject({ cause: thrown });
});
