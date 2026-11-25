import {
  AstBuilder,
  compile,
  GherkinClassicTokenMatcher,
  Parser,
} from "@cucumber/gherkin";
import { IdGenerator } from "@cucumber/messages";
import { beforeAll, describe, expect, test } from "vitest";
import { defaultRunOptions } from "../../../../utils/runOptions.ts";
import { Given } from "../../../cucumber/recorders.ts";
import { platform } from "../platform.ts";

const uri = "features/preview.feature";

/** The scenarios of a feature, as the platform runs them (by name). */
const newId = IdGenerator.incrementing();
const document = new Parser(
  new AstBuilder(newId),
  new GherkinClassicTokenMatcher(),
).parse(`Feature: The preview
  Scenario: Passing
    Given a step

  Scenario: Undefined
    Given a step nobody defined

  Scenario: Ambiguous
    Given a step defined twice
`);
const pickles = compile({ ...document, uri }, uri, newId);
const scenario = (name: string) => {
  const pickle = pickles.find((each) => each.name === name);
  if (!pickle) {
    throw new Error(`no scenario ${name}`);
  }
  return platform.scenario({ uri, name, document, pickle });
};

/** The message of a scenario's error. */
const messageOf = async (name: string) => {
  const { error } = await scenario(name);
  return error?.value instanceof Error ? error.value.message : "";
};

beforeAll(async () => {
  platform.use({ cwd: "/p", options: defaultRunOptions }, async () => {
    Given("a step", () => undefined);
    Given("a step defined twice", () => undefined);
    Given("a step defined twice", () => undefined);
  });
  await platform.load();
});

describe("the preview's platform", () => {
  test("runs a scenario", async () => {
    expect(await scenario("Passing")).toEqual({
      annotations: [],
    });
  });

  test("a summary without colors (no Vitest)", async () => {
    const message = await messageOf("Undefined");
    expect(message).toContain("Undefined");
    expect(message).toContain("a step nobody defined");
    expect(message).not.toMatch(/\u001b\[/);
  });

  test("each definition's location: its call site as the runtime has it (no dev server)", async () => {
    const message = await messageOf("Ambiguous");
    expect(message.match(/platform\.test\.ts:\d+/g)).toHaveLength(2);
  });
});
