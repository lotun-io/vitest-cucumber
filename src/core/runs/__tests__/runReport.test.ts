import type { Envelope } from "@cucumber/messages";
import { describe, expect, test } from "vitest";
import type { MessageBatch } from "../../../types/messages.ts";
import { createRunReport } from "../runReport.ts";

const started = { seconds: 1, nanos: 0 };
const meta = { meta: {} } as unknown as Envelope;

/** A run's report (its opening `meta`), its messages collected. */
const reportOf = () => {
  const messages: Envelope[] = [];
  const report = createRunReport({ started, envelopes: [meta] }, [
    (envelope) => messages.push(envelope),
  ]);
  return { report, messages };
};

const batch = (
  envelopes: readonly Envelope[],
  support = false,
): MessageBatch => ({ support, envelopes });

const stepDefinition = (id: string) =>
  ({ stepDefinition: { id } }) as unknown as Envelope;

/** A run's messages (a BeforeAll run's, a scenario attempt's): a result. */
const ran = (status: string) =>
  batch([
    {
      testStepFinished: { testStepResult: { status } },
    } as unknown as Envelope,
  ]);

const kinds = (envelopes: readonly Envelope[]) =>
  envelopes.map((envelope) => Object.keys(envelope)[0]);

describe("a run's report", () => {
  test("its opening with its first batch; the support code's messages once (every worker sends its own), then `testRunStarted`", () => {
    const { report, messages } = reportOf();
    const undefinedType = {
      undefinedParameterType: { name: "color", expression: "{color}" },
    } as unknown as Envelope;
    const support = batch([stepDefinition("a"), undefinedType], true);
    report.batch(support);
    expect(kinds(messages)).toEqual([
      "meta",
      "stepDefinition",
      "undefinedParameterType",
      "testRunStarted",
    ]);
    // Another worker's: the same messages (one without an id, by its content), nothing new.
    report.batch(support);
    expect(messages).toHaveLength(4);
    // A worker whose support code has another definition: only it.
    report.batch(batch([stepDefinition("a"), stepDefinition("b")], true));
    expect(kinds(messages.slice(4))).toEqual(["stepDefinition"]);
  });

  test("`testRunStarted` before a run's first other batch, its id and start the run's; each batch's messages as they are", () => {
    const { report, messages } = reportOf();
    report.batch(ran("PASSED"));
    expect(messages[1]).toEqual({
      testRunStarted: { id: "", timestamp: started },
    });
    const failed = ran("FAILED");
    report.batch(failed);
    expect(messages.slice(2)).toEqual([
      ...ran("PASSED").envelopes,
      ...failed.envelopes,
    ]);
  });

  test("its end: `testRunFinished` last, its success the run's", () => {
    const { report, messages } = reportOf();
    report.batch(ran("PASSED"));
    report.end(false);
    expect(messages.at(-1)).toEqual({
      testRunFinished: {
        testRunStartedId: "",
        success: false,
        timestamp: expect.any(Object),
      },
    });
  });

  test("a run without batches: its whole stream at its end", () => {
    const { report, messages } = reportOf();
    report.end(true);
    expect(kinds(messages)).toEqual([
      "meta",
      "testRunStarted",
      "testRunFinished",
    ]);
  });
});
