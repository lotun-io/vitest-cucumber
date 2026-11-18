import { describe, expect, test, vi } from "vitest";
import type { LocateRequest } from "../../../../types/storybook.ts";
import { locatedEvent, locateEvent } from "../../../../utils/previewLocate.ts";
import { askDevServer, callSiteOf, locate, rawLocation } from "../locate.ts";

/** A recorded stack in V8's format: the recorder, then the support code's call. */
const v8Stack = [
  "Error",
  "    at http://localhost:6006/node_modules/@lotun/vitest-cucumber/dist/worker/cucumber/registry.mjs:24:51",
  "    at http://localhost:6006/features/steps.ts?t=1730800000000:13:8",
  "    at async importSupport (http://localhost:6006/virtual.js:2:3)",
].join("\n");

describe("the call site of a recorded stack (its second frame)", () => {
  test("V8's format", () => {
    expect(callSiteOf(v8Stack)).toEqual({
      url: "http://localhost:6006/features/steps.ts?t=1730800000000",
      line: 13,
      column: 8,
    });
  });

  test("a V8 frame with a method name", () => {
    expect(
      callSiteOf(
        [
          "Error",
          "    at record (http://h/assets/iframe-1.js:9:2)",
          "    at defineSteps (http://h/assets/steps-2.js:1:153)",
        ].join("\n"),
      ),
    ).toEqual({ url: "http://h/assets/steps-2.js", line: 1, column: 153 });
  });

  test("Firefox's and Safari's format, a path with `@` (`/@fs/`)", () => {
    expect(
      callSiteOf(
        [
          "record@http://localhost:6006/@fs/x/registry.ts:24:51",
          "@http://localhost:6006/@fs/home/u/shared/steps.ts:5:3",
        ].join("\n"),
      ),
    ).toEqual({
      url: "http://localhost:6006/@fs/home/u/shared/steps.ts",
      line: 5,
      column: 3,
    });
  });

  test("none without a second frame", () => {
    expect(callSiteOf("Error\n    at http://h/a.js:1:1")).toBeUndefined();
    expect(callSiteOf(undefined)).toBeUndefined();
  });
});

describe("a call site as it is: its path from the page's folder", () => {
  test("a dev server's module (its query dropped)", () => {
    expect(
      rawLocation(
        {
          url: "http://localhost:6006/features/steps.ts?t=1",
          line: 13,
          column: 8,
        },
        "/home/u/project",
        "http://localhost:6006/iframe.html?id=a--b",
      ),
    ).toEqual({ uri: "features/steps.ts", line: 13, column: 8 });
  });

  test("a file the dev server serves from outside its root: from the project's root", () => {
    const frame = (url: string) => ({ url, line: 5, column: 3 });
    expect(
      rawLocation(
        frame("http://localhost:6006/@fs/home/u/project/features/a.ts"),
        "/home/u/project",
        "http://localhost:6006/iframe.html",
      ).uri,
    ).toBe("features/a.ts");
    expect(
      rawLocation(
        frame("http://localhost:6006/@fs/home/u/shared/steps.ts"),
        "/home/u/project",
        "http://localhost:6006/iframe.html",
      ).uri,
    ).toBe("/home/u/shared/steps.ts");
    expect(
      rawLocation(
        frame("http://localhost:6006/@fs/C:/project/features/a.ts"),
        "C:\\project",
        "http://localhost:6006/iframe.html",
      ).uri,
    ).toBe("features/a.ts");
  });

  test("a static build's chunk, deployed in a subfolder", () => {
    expect(
      rawLocation(
        {
          url: "https://x.io/sb/assets/steps-Bs3bV97d.js",
          line: 1,
          column: 153,
        },
        "/home/u/project",
        "https://x.io/sb/iframe.html?id=a--b",
      ),
    ).toEqual({ uri: "assets/steps-Bs3bV97d.js", line: 1, column: 153 });
  });
});

test("without a dev server, each stack's call site as it is (none without one)", async () => {
  expect(await locate([v8Stack, undefined], "/home/u/project")).toEqual([
    { uri: "features/steps.ts", line: 13, column: 8 },
    undefined,
  ]);
});

/**
 * A page's HMR connection (Vite's `import.meta.hot`, the parts the request uses): what it sends,
 * its listeners, and `answer` to emit an event to them.
 */
const fakeHot = () => {
  const listeners = new Map<string, Set<(data: unknown) => void>>();
  const sent: { event: string; data: LocateRequest }[] = [];
  const hot = {
    on: (event: string, listener: (data: unknown) => void) => {
      listeners.set(event, (listeners.get(event) ?? new Set()).add(listener));
    },
    off: (event: string, listener: (data: unknown) => void) => {
      listeners.get(event)?.delete(listener);
    },
    send: (event: string, data: LocateRequest) => {
      sent.push({ event, data });
    },
  };
  return {
    hot: hot as unknown as NonNullable<Parameters<typeof askDevServer>[1]>,
    sent,
    emit: (event: string, data?: unknown) => {
      for (const listener of listeners.get(event) ?? []) {
        listener(data);
      }
    },
    /** The listeners still registered. */
    listening: () =>
      [...listeners.values()].reduce((count, set) => count + set.size, 0),
  };
};

const location = { uri: "features/steps.ts", line: 4, column: 1 };

describe("the dev server's locations (`storybook dev`)", () => {
  test("none without a dev server (a static build)", async () => {
    expect(await askDevServer([v8Stack], undefined)).toBeUndefined();
  });

  test("its answer to the request (by its id: another's is ignored), the listeners removed", async () => {
    const { hot, sent, emit, listening } = fakeHot();
    const answer = askDevServer([v8Stack], hot);
    expect(sent).toHaveLength(1);
    const [{ event, data } = { event: "", data: { id: 0, stacks: [] } }] = sent;
    expect(event).toBe(locateEvent);
    expect(data.stacks).toEqual([v8Stack]);
    emit(locatedEvent, { id: data.id + 1, locations: [undefined] });
    emit(locatedEvent, { id: data.id, locations: [location] });
    expect(await answer).toEqual([location]);
    expect(listening()).toBe(0);
  });

  test("its error: warned, none", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const { hot, sent, emit, listening } = fakeHot();
    const answer = askDevServer([v8Stack], hot);
    emit(locatedEvent, { id: sent[0]?.data.id, error: "Error: no graph" });
    expect(await answer).toBeUndefined();
    expect(warn).toHaveBeenCalledWith(
      "@lotun/vitest-cucumber: the dev server couldn't locate the support code's definitions: Error: no graph",
    );
    expect(listening()).toBe(0);
    warn.mockRestore();
  });

  test("none once the connection is lost", async () => {
    const { hot, emit, listening } = fakeHot();
    const answer = askDevServer([v8Stack], hot);
    emit("vite:ws:disconnect");
    expect(await answer).toBeUndefined();
    expect(listening()).toBe(0);
  });

  test("none without an answer in time", async () => {
    const { hot, listening } = fakeHot();
    expect(await askDevServer([v8Stack], hot, 10)).toBeUndefined();
    expect(listening()).toBe(0);
  });
});
