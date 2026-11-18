// The summary's colors: the ANSI codes Node's `util.styleText` writes for the styles cucumber's theme
// names (`./theme.ts`), here without Node, so the summary composes in the page too. Whether they're
// written is the run's choice (`colors`: Vitest's output has them), as pretty-formatter asks its
// stream. Page-safe.

/** Each style's opening and closing codes (Node's `util.inspect.colors`). */
const codes = {
  bold: [1, 22],
  italic: [3, 23],
  red: [31, 39],
  green: [32, 39],
  yellow: [33, 39],
  blue: [34, 39],
  magenta: [35, 39],
  cyan: [36, 39],
  gray: [90, 39],
  blackBright: [90, 39],
} as const satisfies Record<string, readonly [number, number]>;

export type Style = keyof typeof codes;

/** Styles text, or not: pretty-formatter's `TextBuilder` writes through it. */
export type Styler = (text: string, style?: Style | readonly Style[]) => string;

/** A styler that writes the codes with `colors`, and none without. */
export const stylerOf =
  ({ colors }: { colors: boolean }): Styler =>
  (text, style) => {
    if (!colors || !style) {
      return text;
    }
    // As `styleText`: the first style outermost.
    return [style].flat().reduceRight((styled, name) => {
      const [open, close] = codes[name];
      return `\u001b[${String(open)}m${styled}\u001b[${String(close)}m`;
    }, text);
  };
