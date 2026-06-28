import { defineParameterType } from "@cucumber/cucumber";

// A non-serializable value (class instance). In browser mode the transform
// round-trips to the page and the instance returns via a value-handle; in node
// it's just the real value. Proves `defineParameterType` in both realms.
export class Point {
  constructor(
    public x: number,
    public y: number,
  ) {}
}

defineParameterType({
  name: "point",
  regexp: /(\d+),(\d+)/,
  transformer: (x: string, y: string) => new Point(Number(x), Number(y)),
});

// A parameter type defined with a STRING regexp (not a RegExp literal) plus the
// `useForSnippets`/`preferForRegexpMatch` options — exercises that metadata
// round-tripping to Node in browser mode (regexp-as-source + the option flags).
defineParameterType({
  name: "color",
  regexp: "red|green|blue",
  useForSnippets: false,
  preferForRegexpMatch: true,
  transformer: (value: string) => value.toUpperCase(),
});

// A parameter type defined with an ARRAY of RegExp alternatives and NO
// transformer — exercises the array-source reduction (each element's `.source`)
// and the default identity transformer (matched text passes through) in both realms.
defineParameterType({
  name: "fruit",
  regexp: [/apple/, /banana/],
});
