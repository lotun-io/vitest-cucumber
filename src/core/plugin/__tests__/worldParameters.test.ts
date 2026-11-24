import { expect, test } from "vitest";
import { jsonWorldParameters } from "../worldParameters.ts";

type WorldParameters = Parameters<typeof jsonWorldParameters>[0];

/** The error `jsonWorldParameters` throws for `worldParameters`. */
const thrownFor = (worldParameters: unknown) => {
  try {
    // Any value: what a config may give, whatever its type says.
    jsonWorldParameters(worldParameters as WorldParameters);
  } catch (error) {
    return error;
  }
  return undefined;
};

test("JSON values: a copy of them, the given object left as it is", () => {
  const given = { url: "http://a", list: [1, { two: [2] }] };
  const parameters = jsonWorldParameters(given);
  expect(parameters).toEqual(given);
  expect(parameters).not.toBe(given);
  expect(parameters.list).not.toBe(given.list);
});

test("values JSON changes: as the Worlds get them", () => {
  expect(
    jsonWorldParameters({
      at: new Date(0),
      missing: undefined,
      rate: Number.NaN,
    } as unknown as WorldParameters),
  ).toEqual({ at: "1970-01-01T00:00:00.000Z", rate: null });
});

test("a value JSON.stringify refuses: the plugin's error, JSON.stringify's its cause", () => {
  const parameters: Record<string, unknown> = {};
  parameters.self = parameters;
  for (const [value, cause] of [
    [{ limit: 10n }, "Do not know how to serialize a BigInt"],
    [parameters, "Converting circular structure to JSON"],
  ] as const) {
    expect(thrownFor(value)).toMatchObject({
      message: `[@lotun/vitest-cucumber] the "worldParameters" option can't be converted to JSON`,
      cause: expect.objectContaining({
        message: expect.stringContaining(cause) as unknown,
      }) as unknown,
    });
  }
});

test("the cause: the error the user's code threw (a toJSON's, a getter's), its stack with it", () => {
  const thrown = new Error("not ready");
  expect(
    thrownFor({
      at: {
        toJSON() {
          throw thrown;
        },
      },
    }),
  ).toMatchObject({ cause: thrown });
});
