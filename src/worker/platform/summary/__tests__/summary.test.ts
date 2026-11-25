import {
  AstBuilder,
  compile,
  GherkinClassicTokenMatcher,
  Parser,
} from "@cucumber/gherkin";
import { IdGenerator, type Pickle } from "@cucumber/messages";
import { describe, expect, test } from "vitest";
import { defaultRunOptions } from "../../../../utils/runOptions.ts";
import { createRuntimeEnvironment } from "../../../browser/runtimeEnvironment.ts";
import { createRunner } from "../../../runner/runner.ts";
import { buildSupportCode } from "../../../runner/supportCode.ts";
import { summaryOf } from "../summary.ts";

describe("summaryOf", () => {
  /** A run of a scenario with a pending step (the runtime's messages). */
  const pendingRun = async () => {
    const uri = "a.feature";
    const newId = IdGenerator.incrementing();
    const document = {
      ...new Parser(
        new AstBuilder(newId),
        new GherkinClassicTokenMatcher(),
      ).parse("Feature: A\n  Scenario: a\n    Given a pending step\n"),
      uri,
    };
    const feature = { document, pickles: [...compile(document, uri, newId)] };
    const runner = createRunner({
      workerId: "1",
      support: buildSupportCode(
        [
          {
            method: "Given",
            args: ["a pending step", () => "pending"],
            location: { uri: "steps.ts", line: 1, column: 1 },
          },
        ],
        { newId },
      ),
      newId,
      options: defaultRunOptions,
      environment: {
        ...createRuntimeEnvironment(),
        defaultTimeouts: { test: 5000, hook: 5000 },
      },
    });
    return runner.scenario(feature.document, feature.pickles[0] as Pickle);
  };

  test("in Vitest's colors: cucumber's, or plain text", async () => {
    const { query } = await pendingRun();
    const colored = summaryOf({ query, colors: true });
    const plain = summaryOf({ query, colors: false });
    const ansi = /\u001b\[/;
    expect(colored).toMatch(ansi);
    expect(plain).not.toMatch(ansi);
    expect(plain).toContain("Pending steps:\n  Given a pending step");
    // The same text, but its colors.
    expect(colored?.replace(/\u001b\[[\d;]*m/g, "")).toBe(plain);
  });
});
