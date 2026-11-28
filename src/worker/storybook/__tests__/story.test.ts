import { expect, test, vi } from "vitest";
import { gherkinOf } from "../../__tests__/gherkinOf.ts";
import {
  currentStory,
  runStory,
  setRunner,
  type StoryContextLike,
  storyEnvironment,
} from "../story.ts";

const { around } = storyEnvironment();

test("a Storybook page's steps: their placeholders as `{string}`, the rest as written", () => {
  const { expressionOf } = storyEnvironment();
  expect(expressionOf("the {storybook:story} story")).toBe(
    "the {string} story",
  );
  expect(expressionOf("the unmounted {storybook:storyUnmounted} story")).toBe(
    "the unmounted {string} story",
  );
  expect(
    expressionOf("the stories of {storybook:storiesFile} with {int}"),
  ).toBe("the stories of {string} with {int}");
  expect(expressionOf("the {storybook:other} {word}")).toBe(
    "the {storybook:other} {word}",
  );
});

const target = {
  uri: "a.feature",
  gherkin: gherkinOf(
    "Feature: A\n  Scenario: s\n    Given a step\n",
    "a.feature",
  ),
  line: 2,
};

/** What `body` gives, run by the page's runner as a story with `context` plays. */
const inStory = async <T>(
  context: StoryContextLike,
  body: () => Promise<T>,
): Promise<T> => {
  let result: { value: T } | undefined;
  setRunner({
    run: async () => {
      result = { value: await body() };
    },
  });
  await runStory(context, target);
  if (!result) {
    throw new Error("the runner didn't run");
  }
  return result.value;
};

const failure = new Error("boom");
const failed = { error: failure, failure: { value: failure } };
const passed = { result: "done", failure: undefined };

test("no story running: a step's code runs as it is, its outcome given back, a failed one too", async () => {
  expect(await around("Given a step", () => Promise.resolve(passed))).toBe(
    passed,
  );
  expect(await around("Given a step", () => Promise.resolve(failed))).toBe(
    failed,
  );
});

test("a story whose context has no `step`: the same", async () => {
  expect(
    await inStory({}, () =>
      around("Given a step", () => Promise.resolve(failed)),
    ),
  ).toBe(failed);
});

test("a step of the running story: Storybook's `step` gets the Gherkin step's label and runs the code inside it; the outcome is kept outside it (Storybook's gives nothing back)", async () => {
  const step = vi.fn(async (_label: string, play: () => Promise<void>) => {
    await play();
  });
  expect(
    await inStory({ step }, () =>
      around("Given a step", () => Promise.resolve(passed)),
    ),
  ).toBe(passed);
  expect(step).toHaveBeenCalledExactlyOnceWith(
    "Given a step",
    expect.any(Function),
  );
});

test("its code failed: the real error is thrown inside the story's step (Storybook marks it failed), and the outcome is still the runtime's, not thrown", async () => {
  const thrown: unknown[] = [];
  const step = async (_label: string, play: () => Promise<void>) => {
    try {
      await play();
    } catch (error) {
      thrown.push(error);
      throw error;
    }
  };
  expect(
    await inStory({ step }, () =>
      around("When it fails", () => Promise.resolve(failed)),
    ),
  ).toBe(failed);
  expect(thrown).toEqual([failure]);
  expect(thrown[0]).toBe(failure);
});

test("Storybook's `step` failing before the code ran: its own error thrown, there's no outcome to give", async () => {
  const code = vi.fn(() => Promise.resolve(passed));
  const step = () => Promise.reject(new Error("no step for you"));
  await expect(
    inStory({ step }, () => around("Given a step", code)),
  ).rejects.toThrow("no step for you");
  expect(code).not.toHaveBeenCalled();
});

test("once the story ended, nothing is a step of it", async () => {
  const step = vi.fn(async (_label: string, play: () => Promise<void>) => {
    await play();
  });
  await inStory({ step }, () => Promise.resolve());
  await around("Given a step", () => Promise.resolve(passed));
  expect(step).not.toHaveBeenCalled();
});

test("a story played while another plays (an HMR update re-renders it mid-play): it runs once the other ended, its own story the running one", async () => {
  const runs: string[] = [];
  let end: () => void = () => undefined;
  const first: StoryContextLike = {};
  const second: StoryContextLike = {};
  setRunner({
    run: async () => {
      const story = currentStory() === first ? "first" : "second";
      runs.push(`${story} starts`);
      if (story === "first") {
        await new Promise<void>((resolve) => {
          end = resolve;
        });
      }
      runs.push(
        `${story} ends, its story ${currentStory() === first ? "first" : "second"}`,
      );
      if (story === "first") {
        throw new Error("the first failed");
      }
    },
  });
  const playingFirst = runStory(first, target);
  const playingSecond = runStory(second, target);
  await Promise.resolve();
  expect(runs).toEqual(["first starts"]);
  end();
  await expect(playingFirst).rejects.toThrow("the first failed");
  await playingSecond;
  expect(runs).toEqual([
    "first starts",
    "first ends, its story first",
    "second starts",
    "second ends, its story second",
  ]);
  expect(currentStory()).toBeUndefined();
});
