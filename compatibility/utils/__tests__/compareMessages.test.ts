import { expect, test } from "vitest";
import { compareMessages } from "../kit.ts";

/** A stream of one scenario with two steps, the second step's result on the step `finished` names. */
const streamOf = (ids: Record<string, string>, finished = ids.second) => [
  {
    pickle: {
      id: ids.pickle,
      uri: "a.feature",
      steps: [{ id: ids.first }, { id: ids.second }],
    },
  },
  {
    testCase: {
      id: ids.testCase,
      pickleId: ids.pickle,
      testSteps: [
        { id: ids.firstTest, pickleStepId: ids.first },
        { id: ids.secondTest, pickleStepId: ids.second },
      ],
    },
  },
  { testCaseStarted: { id: ids.started, testCaseId: ids.testCase } },
  {
    testStepFinished: {
      testCaseStartedId: ids.started,
      testStepId: ids.firstTest,
    },
  },
  {
    testStepFinished: { testCaseStartedId: ids.started, testStepId: finished },
  },
];

const native = {
  pickle: "8",
  first: "6",
  second: "7",
  testCase: "12",
  firstTest: "10",
  secondTest: "11",
  started: "13",
};
// Another implementation's ids: other values, given in another order.
const plugin = {
  pickle: "p-1",
  first: "s-2",
  second: "s-1",
  testCase: "c-1",
  firstTest: "t-9",
  secondTest: "t-3",
  started: "a-1",
};

test("streams linked alike are the same, whatever their ids", () => {
  expect(
    compareMessages(streamOf(native), streamOf(plugin), { inPage: false }),
  ).toEqual([]);
});

test("a message that refers to another one than cucumber's is a difference", () => {
  const differences = compareMessages(
    streamOf(native),
    // The second step's result, on the first step.
    streamOf(plugin, plugin.firstTest),
    { inPage: false },
  );
  expect(differences).toHaveLength(1);
  expect(differences[0]).toContain("message #5");
});
