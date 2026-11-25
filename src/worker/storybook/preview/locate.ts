// Where the preview's support code calls were made, as browser mode's page asks main
// (`Actions["locate"]`): in `storybook dev`, the recorded stacks sent to the dev server over Vite's
// HMR connection, which locates them as main does browser mode's (`../../../core/storybook/preset/locate.ts`).
// In a static build (no server, no maps), or without an answer (the dev server's error, the
// connection lost, 5 s), each stack's call site as the browser
// has it, as Storybook's own panel shows a story's frames (the bundle's), its path from the page's
// folder: the stack's second frame (the first is the recorder, `../../cucumber/registry.ts`, the
// function the support code calls), cucumber's first frame outside cucumber, by position (our code
// and the user's can share a chunk: no path tells them apart). Preview only.
/// <reference types="vite/client" />
import type { Actions } from "../../../types/commands.ts";
import type {
  LocateRequest,
  LocateResponse,
} from "../../../types/storybook.ts";
import type { DefinitionLocation } from "../../../types/supportCode.ts";
import { pluginErrorMessage } from "../../../utils/errors.ts";
import { locatedEvent, locateEvent } from "../../../utils/previewLocate.ts";
import { slash } from "../../../utils/slash.ts";

/** A V8 frame (`at …`); otherwise Firefox's and Safari's (`method@location`). */
const v8Frame = /^\s*at /;

/** A frame's location: the script's URL, its line and column. */
const locationOf = /^(.+):(\d+):(\d+)$/;

/** A frame as the page's stack has it: the script's URL, its line and column (1-based). */
export interface RawFrame {
  url: string;
  line: number;
  column: number;
}

/** The location part of a stack `line`, in V8's, Firefox's or Safari's format. */
const locationPart = (line: string) => {
  const text = line.trim();
  if (v8Frame.test(text)) {
    // `at method (location)` or `at location`.
    return text.endsWith(")")
      ? text.slice(text.lastIndexOf("(") + 1, -1)
      : text.replace(/^at (async )?/, "");
  }
  return text.slice(text.indexOf("@") + 1);
};

/** The call site of a recorded `stack` (its second frame), if it has one. */
export const callSiteOf = (stack: string | undefined): RawFrame | undefined => {
  const lines = stack?.split("\n") ?? [];
  const frames = lines.some((line) => v8Frame.test(line))
    ? lines.filter((line) => v8Frame.test(line))
    : lines.filter((line) => line.includes("@"));
  const frame = frames[1];
  const match =
    frame === undefined ? null : locationOf.exec(locationPart(frame));
  if (!match) {
    return undefined;
  }
  const [, url = "", line = "0", column = "0"] = match;
  return { url, line: Number(line), column: Number(column) };
};

/**
 * `frame` as it is: its file from the page's folder (`base`, the page's URL), or from `cwd` for a
 * file the dev server serves from outside its root (`/@fs/<absolute path>`).
 */
export const rawLocation = (
  { url, line, column }: RawFrame,
  cwd: string,
  base: string,
): DefinitionLocation => {
  const file = decodeURI(new URL(url, base).pathname);
  if (file.startsWith("/@fs/")) {
    const absolute = /^\/@fs\/[a-zA-Z]:\//.test(file)
      ? file.slice(5)
      : file.slice(4);
    const root = `${slash(cwd)}/`;
    return {
      uri: absolute.startsWith(root) ? absolute.slice(root.length) : absolute,
      line,
      column,
    };
  }
  const folder = decodeURI(new URL(".", base).pathname);
  return {
    uri: file.startsWith(folder) ? file.slice(folder.length) : file.slice(1),
    line,
    column,
  };
};

/** The page's URL (its folder the base of a frame's path). */
const pageUrl = () =>
  (globalThis as { document?: { baseURI: string } }).document?.baseURI ??
  "http://localhost/";

/**
 * How long the page waits for the dev server's answer (Storybook's own request/response timeout): an
 * answer can't come if the HMR connection never opens (Vite fires no event then).
 */
const answerTimeout = 5000;

let lastRequest = 0;

/**
 * The dev server's locations of `stacks` (`storybook dev`), or none: no dev server (a static build:
 * no `hot`), its error (warned), the HMR connection lost (Vite's `vite:ws:disconnect`), or no answer
 * in `timeout` ms. Vite's client holds the request until its connection opens. `hot` is the page's
 * HMR connection (the module's own: a parameter for its tests).
 */
export const askDevServer = (
  stacks: LocateRequest["stacks"],
  hot = import.meta.hot,
  timeout = answerTimeout,
) => {
  if (!hot) {
    return Promise.resolve(undefined);
  }
  lastRequest += 1;
  const id = lastRequest;
  const disconnected = new AbortController();
  const disconnect = () => {
    disconnected.abort();
  };
  const signal = AbortSignal.any([
    disconnected.signal,
    AbortSignal.timeout(timeout),
  ]);
  return new Promise<Actions["locate"][1] | undefined>((resolve) => {
    const done = (locations?: Actions["locate"][1]) => {
      hot.off(locatedEvent, answered);
      hot.off("vite:ws:disconnect", disconnect);
      signal.removeEventListener("abort", aborted);
      resolve(locations);
    };
    const answered = (response: LocateResponse) => {
      if (response.id !== id) {
        return;
      }
      if ("error" in response) {
        console.warn(
          pluginErrorMessage(
            `the dev server couldn't locate the support code's definitions (${response.error})`,
          ),
        );
        done();
        return;
      }
      done(response.locations);
    };
    const aborted = () => {
      done();
    };
    signal.addEventListener("abort", aborted, { once: true });
    hot.on("vite:ws:disconnect", disconnect);
    hot.on(locatedEvent, answered);
    hot.send(locateEvent, { id, stacks } satisfies LocateRequest);
  });
};

/** Each recorded stack's location: the dev server's, else its call site as it is (none without one). */
export const locate = async (
  stacks: LocateRequest["stacks"],
  cwd: string,
): Promise<(DefinitionLocation | undefined)[]> => {
  const mapped = stacks.some(Boolean) ? await askDevServer(stacks) : undefined;
  return stacks.map((stack, index) => {
    const frame = callSiteOf(stack);
    return mapped?.[index] ?? (frame && rawLocation(frame, cwd, pageUrl()));
  });
};
