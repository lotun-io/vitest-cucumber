import { describe, expect, test, vi } from "vitest";
import type { FeatureGherkin } from "../../../../types/feature.ts";
import type {
  HookOutcome,
  ScenarioOutcome,
} from "../../../../types/platform.ts";
import { defaultRunOptions } from "../../../../utils/runOptions.ts";
import { scenarioAt } from "../../../platform/scenario/scenarioAt.ts";
import { runStory } from "../../story.ts";
import { beforeAll as annotationBeforeAll } from "../annotation.ts";
import { createPreviewRunner } from "../runner.ts";

/** A story's target: the scenario at line 3. */
const target = {
  uri: "src/Login.feature",
  gherkin: {
    document: {},
    pickles: [{ name: "Log in", location: { line: 3 } }],
  } as unknown as FeatureGherkin,
  line: 3,
};

/** Its scenario, as `runStory` gives the runner (`../../story.ts`). */
const scenario = scenarioAt(target, target.line);

const passed: HookOutcome = { passed: true };

/** A preview runner on a fake platform (what the runner asks of it), its notes recorded. */
const fakes = () => {
  const platform = {
    testRunStartedId: () => "run",
    use: vi.fn<() => void>(),
    load: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
    beforeAll: vi.fn<() => Promise<HookOutcome>>().mockResolvedValue(passed),
    afterAll: vi.fn<() => Promise<HookOutcome>>().mockResolvedValue(passed),
    scenario: vi
      .fn<() => Promise<ScenarioOutcome>>()
      .mockResolvedValue({ annotations: [] }),
  };
  const note = vi
    .fn<(label: string) => Promise<void>>()
    .mockResolvedValue(undefined);
  const importSupport = async () => undefined;
  const runner = createPreviewRunner({
    platform,
    run: { cwd: "/p", options: defaultRunOptions },
    importSupport,
    note,
  });
  return { platform, note, importSupport, runner };
};

describe("the preview's runner", () => {
  test("loads the support code for the run, then runs BeforeAll once", async () => {
    const { platform, importSupport, runner } = fakes();
    await runner.beforeAll?.();
    await runner.run(scenario);
    await runner.run(scenario);
    expect(platform.use).toHaveBeenCalledWith(
      { cwd: "/p", options: defaultRunOptions },
      importSupport,
    );
    expect(platform.beforeAll).toHaveBeenCalledTimes(1);
    expect(platform.scenario).toHaveBeenCalledTimes(2);
    expect(platform.scenario).toHaveBeenCalledWith(
      expect.objectContaining({ uri: "src/Login.feature", name: "Log in" }),
    );
  });

  test("a story played first runs BeforeAll: its error the story's, its scenario not run", async () => {
    const { platform, runner } = fakes();
    const error = new Error("BeforeAll failed");
    platform.beforeAll.mockResolvedValue({ passed: false, error });
    await expect(runner.run(scenario)).rejects.toBe(error);
    expect(platform.scenario).not.toHaveBeenCalled();
  });

  test("a failed scenario: a note per annotation (in order), then its error", async () => {
    const { platform, note, runner } = fakes();
    const error = new Error("a step failed");
    platform.scenario.mockResolvedValue({
      annotations: [
        { type: "log", message: "hello" },
        { type: "attachment", message: "image/png" },
      ],
      error: { value: error },
    });
    await expect(runner.run(scenario)).rejects.toBe(error);
    expect(note.mock.calls).toEqual([
      ["log: hello"],
      ["attachment: image/png"],
    ]);
  });

  test("a passing scenario's annotations: no notes", async () => {
    const { platform, note, runner } = fakes();
    platform.scenario.mockResolvedValue({
      annotations: [{ type: "log", message: "hello" }],
    });
    await runner.run(scenario);
    expect(note).not.toHaveBeenCalled();
  });

  test("a skipped scenario passes, its skip a note (with its note, if any)", async () => {
    const { platform, note, runner } = fakes();
    platform.scenario
      .mockResolvedValueOnce({
        annotations: [],
        skipped: { note: "not ready" },
      })
      .mockResolvedValueOnce({
        annotations: [],
        skipped: {},
      });
    await runner.run(scenario);
    await runner.run(scenario);
    expect(note.mock.calls).toEqual([["Skipped: not ready"], ["Skipped"]]);
  });

  test("a story ends once its notes are done (each a step of the story, which Storybook's step debugger holds)", async () => {
    const { platform, note, runner } = fakes();
    let noted: () => void = () => undefined;
    note.mockReturnValueOnce(
      new Promise<void>((resolve) => {
        noted = resolve;
      }),
    );
    platform.scenario.mockResolvedValue({ annotations: [], skipped: {} });
    const ended = vi.fn();
    const running = runner.run(scenario).then(ended);
    await vi.waitFor(() => expect(note).toHaveBeenCalledTimes(1));
    expect(ended).not.toHaveBeenCalled();
    noted();
    await running;
    expect(ended).toHaveBeenCalledTimes(1);
  });

  test("AfterAll: only once BeforeAll ran, once; a later story runs BeforeAll again", async () => {
    const { platform, runner } = fakes();
    await runner.afterAll?.();
    expect(platform.afterAll).not.toHaveBeenCalled();
    await runner.run(scenario);
    await runner.afterAll?.();
    await runner.afterAll?.();
    expect(platform.afterAll).toHaveBeenCalledTimes(1);
    await runner.run(scenario);
    expect(platform.beforeAll).toHaveBeenCalledTimes(2);
  });

  test("without `importSupport` (the preset isn't serving the support module): its reason, nothing loaded", async () => {
    const platform = fakes().platform;
    // `fakes()`'s own runner gave it its support code.
    platform.use.mockClear();
    const runner = createPreviewRunner({
      platform,
      run: { cwd: "/p", options: defaultRunOptions },
      importSupport: undefined,
      note: () => undefined,
    });
    await expect(runner.run(scenario)).rejects.toThrow(
      "the preview's support code isn't served",
    );
    expect(platform.use).not.toHaveBeenCalled();
    expect(platform.load).not.toHaveBeenCalled();
  });

  test("AfterAll's error is thrown", async () => {
    const { platform, runner } = fakes();
    const error = new Error("AfterAll failed");
    platform.afterAll.mockResolvedValue({ passed: false, error });
    await runner.beforeAll?.();
    await expect(runner.afterAll?.()).rejects.toBe(error);
  });
});

describe("the preview's annotation, without the preset (its support module the placeholder)", () => {
  const notServed = {
    message:
      "[@lotun/vitest-cucumber] the preview's support code isn't served, add cucumber({ … }) from @lotun/vitest-cucumber/storybook/node to the addons in .storybook/main.ts",
  };

  test("Storybook's `beforeAll`: the support code loads first, its error said", async () => {
    await expect(annotationBeforeAll()).rejects.toMatchObject(notServed);
  });

  test("sets the page's runner as it loads: a story runs on it", async () => {
    await expect(runStory({}, target)).rejects.toMatchObject(notServed);
  });
});
