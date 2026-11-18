// The parameter types `../parameter-types.feature` uses: a transformer making a class's instance, a
// transformer of several capture groups, a string regexp with options, alternatives without a
// transformer, and a transformer reading its scenario's World (`this`).
import { defineParameterType } from "@cucumber/cucumber";
import type { TestWorld } from "./world.ts";

export class Point {
  x: number;
  y: number;
  constructor(x: number, y: number) {
    this.x = x;
    this.y = y;
  }
}

defineParameterType({
  name: "point",
  regexp: /(\d+),(\d+)/,
  transformer: (x: string, y: string) => new Point(Number(x), Number(y)),
});

defineParameterType({
  name: "color",
  regexp: "red|green|blue",
  useForSnippets: false,
  preferForRegexpMatch: true,
  transformer: (value: string) => value.toUpperCase(),
});

defineParameterType({
  name: "fruit",
  regexp: [/apple/, /banana/],
});

defineParameterType({
  name: "scaled",
  regexp: /\d+/,
  transformer(this: TestWorld, value: string) {
    return Number(value) * this.value;
  },
});
