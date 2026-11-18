// Errors shaped for Vitest's printer: a step's line in the feature file as a stack's first frame
// (in the stack's own format: V8's, Firefox's or Safari's), and the plugin's errors at a step.
// Page-safe.
import type { Location } from "@cucumber/messages";
import type { StepFrame as Frame } from "../../../types/platform.ts";

/** The frame at `location` in `file` (column 1 if it has none). */
export const frameAt = (
  file: string,
  { line, column = 1 }: Location,
): Frame => ({
  file,
  line,
  column,
});

/** `frame` as a V8 stack line. */
const v8LineOf = ({ file, line, column }: Frame) =>
  `    at ${file}:${String(line)}:${String(column)}`;

/** `frame` as a Firefox or Safari stack line (no method). */
const ffOrSafariLineOf = ({ file, line, column }: Frame) =>
  `@${file}:${String(line)}:${String(column)}`;

/** An error with `message`, `frame` as its only frame (if given, a V8 line), and `cause`. */
export const errorAt = (
  message: string,
  frame: Frame | undefined,
  cause: unknown,
) => {
  const error = new Error(message, { cause });
  error.stack = frame ? `${String(error)}\n${v8LineOf(frame)}` : String(error);
  return error;
};

/** Vitest's test for a V8 frame (`CHROME_IE_STACK_REGEXP` in `@vitest/utils`, not exported). */
const v8Frame = /^\s*at .*(?:\S:\d+|\(native\))/;

/** A Firefox or Safari frame: `method@location`. */
const ffOrSafariFrame = /@/;

/**
 * `stack` with `frame` as its first frame, in the stack's own format,
 * as Vitest will parse it: Vitest reads a stack as V8's if any line is a V8 frame, else as Firefox's
 * or Safari's, each line `method@location` (it drops the others). So in a V8 stack after its header
 * (`Name: message`, a message's lines), in a Firefox or Safari one (no header) first as
 * `@location`; a stack without frames gets it after its text. The engine's own frames stay as they
 * are, for Vitest's parser (`async*`, `[native code]`, eval's, a page's URLs, which main maps).
 */
export const withStepFrame = (stack: string, frame: Frame) => {
  const lines = stack.split("\n");
  const v8Start = lines.findIndex((line) => v8Frame.test(line));
  if (v8Start !== -1) {
    return [
      ...lines.slice(0, v8Start),
      v8LineOf(frame),
      ...lines.slice(v8Start),
    ].join("\n");
  }
  if (lines.some((line) => ffOrSafariFrame.test(line))) {
    return `${ffOrSafariLineOf(frame)}\n${stack}`;
  }
  return `${stack}\n${v8LineOf(frame)}`;
};
