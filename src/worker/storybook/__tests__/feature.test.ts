import { describe, expect, test } from "vitest";
import type { ScenarioToRun } from "../../../types/platform.ts";
import type { FeatureModel } from "../../../types/storybook.ts";
import { scenarioAt } from "../../platform/scenario/scenarioAt.ts";
import { createFeature } from "../feature.ts";
import { scenarioOf } from "../scenarioPlay.ts";
import { currentStory, setRunner } from "../story.ts";

/** A feature: a scenario (tagged), and an Outline of two rows (its pickles: the scenario's, the rows'). */
const model = {
  uri: "src/Login.feature",
  gherkin: {
    document: {},
    pickles: [
      { name: "Log in", location: { line: 3 }, tags: [{ name: "@smoke" }] },
      { name: "Sign up then Log in", location: { line: 11 }, tags: [] },
      { name: "Sign up then Sign up", location: { line: 12 }, tags: [] },
    ],
  },
} as unknown as FeatureModel;

/** The page's runner, recording what it runs and the story running then. */
const recorded = () => {
  const runs: { scenario: ScenarioToRun; story: unknown }[] = [];
  setRunner({
    run: async (scenario) => {
      runs.push({ scenario, story: currentStory() });
    },
  });
  return runs;
};

describe("a feature's play of a scenario, or Outline row, at its line", () => {
  test("a scenario's: the runner gets the scenario at that line, the story running as it runs", async () => {
    const runs = recorded();
    const context = {};
    await createFeature(model).playAt({
      line: 3,
      story: "Primary",
      unmounted: false,
    })(context);
    expect(runs).toEqual([
      {
        scenario: scenarioAt(model, 3),
        story: context,
      },
    ]);
    expect(currentStory()).toBeUndefined();
  });

  test("its text: an unmounted one's destructures `mount` (Storybook doesn't render first), any other's doesn't", () => {
    const feature = createFeature(model);
    expect(
      feature
        .playAt({ line: 3, story: "Primary", unmounted: false })
        .toString(),
    ).not.toContain("mount");
    expect(
      feature.playAt({ line: 3, story: "Primary", unmounted: true }).toString(),
    ).toMatch(/^async \(\{\s*mount,/);
  });

  test("unmounted: the steps get Storybook's `mount`, and only they mount the story", async () => {
    const mounts: unknown[][] = [];
    const mount = async (...args: unknown[]) => {
      mounts.push(args);
    };
    setRunner({
      run: async () => {
        await currentStory()?.mount?.("<Button big />");
      },
    });
    const feature = createFeature(model);
    await feature.playAt({ line: 3, story: "Primary", unmounted: true })({
      mount,
    });
    expect(mounts).toEqual([["<Button big />"]]);
    mounts.length = 0;
    recorded();
    await feature.playAt({ line: 3, story: "Primary", unmounted: true })({
      mount,
    });
    expect(mounts).toEqual([]);
  });

  test("marked with its line, its story and its pickle's tags; a line without one, with none", () => {
    const feature = createFeature(model);
    expect(
      scenarioOf(
        feature.playAt({ line: 3, story: "Primary", unmounted: false }),
      ),
    ).toEqual({
      line: 3,
      exportName: "Primary",
      tags: ["@smoke"],
    });
    expect(
      scenarioOf(feature.playAt({ line: 12, story: null, unmounted: false })),
    ).toEqual({
      line: 12,
      exportName: null,
      tags: [],
    });
    expect(
      scenarioOf(feature.playAt({ line: 99, story: null, unmounted: false })),
    ).toEqual({
      line: 99,
      exportName: null,
      tags: [],
    });
  });
});

describe("what a feature's stories module takes of its stories file", () => {
  test("a story: as it is; a function story: its function its `render` too", () => {
    const feature = createFeature(model);
    const story = { args: { label: "A" } };
    expect(feature.storyOf(story)).toBe(story);
    const fn = Object.assign(() => null, { args: { label: "B" } });
    expect(feature.storyOf(fn)).toEqual({ args: { label: "B" }, render: fn });
  });

  test("the meta: without the stories it selects, its play or its id", () => {
    const meta = {
      title: "Button",
      id: "my-button",
      component: "Button",
      includeStories: ["Primary"],
      excludeStories: /Data$/,
      play: async () => undefined,
    };
    expect(createFeature(model).metaOf(meta)).toEqual({
      title: "Button",
      component: "Button",
    });
  });
});

describe("the scenario at a line", () => {
  test("a row's: its pickle, named after it", () => {
    const scenario = scenarioAt(model, 12);
    expect(scenario.name).toBe("Sign up then Sign up");
    expect(scenario.pickle).toBe(model.gherkin.pickles[2]);
  });

  test("a line with nothing to run (an Outline's own, none): an error naming it", () => {
    for (const line of [6, 99]) {
      expect(() => scenarioAt(model, line)).toThrow(
        `no scenario at line ${String(line)} of src/Login.feature`,
      );
    }
  });
});
