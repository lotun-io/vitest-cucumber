// Storybook: the steps that link a scenario to a story, found in the support code without running it.
// A user words them in their own step definitions, with the plugin's parameter types
// (`../../../utils/storybookParameterTypes.ts`, defined by Storybook's hosts when a support file
// has such a step: `used`, on each Storybook plan):
//
//   Given("the {storybook:story} story", (_story: string) => {});
//   Given("the unmounted {storybook:storyUnmounted} story", (_story: string) => {});
//   Given("the stories of {storybook:storiesFile}", (_file: string) => {});
//
// Main needs the links before anything runs (Storybook's index, the story tests), and the support
// code runs only in the page. A Storybook step's expression is a string literal with one of the plugin's
// parameter types, the first argument of a step definition (`Given(`, `When(`, `Then(`,
// `defineStep(`), so a regex finds it in each support file (no parser), its value is the literal's
// (evaluated on its own: its escapes), and it's compiled with cucumber's built-in parameter types and
// the plugin's, matching a step's text exactly as cucumber will. A Storybook step uses one of the
// plugin's parameter types, once; another parameter type in it (the user's own) is an error: main
// doesn't know its pattern.
import {
  CucumberExpression,
  ParameterType,
  ParameterTypeRegistry,
} from "@cucumber/cucumber-expressions";
import { storybookParameterTypes } from "../../../utils/storybookParameterTypes.ts";

/** Where something is: `file:line`. */
type At = string;

/** A Storybook step's expression, as found in a support file: its value, or its text if it can't be read. */
interface FoundExpression {
  at: At;
  source?: string;
  unreadable?: string;
}

/** What a step's text links: a story (and whether it's unmounted), a stories file. */
export interface StepLink {
  /** The matching definition's location. */
  at: At;
  exportName?: string;
  unmounted: boolean;
  storiesFile?: string;
}

/** The plugin's parameter types. */
const storybookTypes = Object.values(storybookParameterTypes);

/** Their names. */
const storybookTypeNames = new Set<string>(
  storybookTypes.map(({ name }) => name),
);

/** Their names without their namespace (`story`, `storyUnmounted`, `storiesFile`). */
const typeNames = storybookTypes.map(({ name }) =>
  name.replace("storybook:", ""),
);

/**
 * A step definition's expression using one of the plugin's parameter types: `Given(`, `When(`, `Then(` or `defineStep(`
 * (also as `cucumber.Given(`), then a string literal (`"…"`, `'…'`, or a template literal): its text
 * (group 2, its quotes included).
 */
const storybookStepLiteral = new RegExp(
  String.raw`\b(?:Given|When|Then|defineStep)\s*\(\s*((["'\x60])(?:\\.|(?!\2)[^\\\n])*?\{storybook:(?:${typeNames.join("|")})\}(?:\\.|(?!\2)[^\\\n])*\2)`,
  "g",
);

/** A string literal's value (its escapes), if it's a plain one (a template literal without `${`). */
const valueOf = (literal: string) => {
  if (literal.startsWith("`") && literal.includes("${")) {
    return undefined;
  }
  const value: unknown = new Function(`"use strict"; return (${literal});`)();
  return typeof value === "string" ? value : undefined;
};

/** The Storybook steps' expressions in support file `file` (its `code`). */
export const scanSupportCode = (code: string, file: string) =>
  [...code.matchAll(storybookStepLiteral)].map(
    ({ 1: literal = "", index }): FoundExpression => {
      const at = `${file}:${String(code.slice(0, index).split("\n").length)}`;
      const source = valueOf(literal);
      return source === undefined
        ? { at, unreadable: literal }
        : { at, source };
    },
  );

/** The expressions of one support file's scan. */
type Scan = ReturnType<typeof scanSupportCode>;

/**
 * The Storybook steps of the support files' `scans`: `used` whether they have any (one found,
 * readable or not: its host then defines the plugin's parameter types), `expressions` each one's
 * as written (watch mode: every feature links again when they're others), `match` gives each
 * Storybook step a step's `text` matches (two or more: ambiguous), and `errors` the expressions
 * that can't be compiled as cucumber would (one that can't be read, or uses a parameter type other
 * than cucumber's and the plugin's).
 */
export const storybookStepsOf = (scans: Scan[]) => {
  const registry = new ParameterTypeRegistry();
  for (const { name, regexp } of storybookTypes) {
    registry.defineParameterType(
      new ParameterType(name, regexp, String, (text: string) => text),
    );
  }
  const errors: string[] = [];
  const expressions: { at: At; expression: CucumberExpression }[] = [];
  for (const { at, source, unreadable } of scans.flat()) {
    if (source === undefined) {
      errors.push(
        `the Storybook step at ${at} (${unreadable ?? ""}) can't be read: write its expression as a string literal`,
      );
      continue;
    }
    const names = [...source.matchAll(/\{([^{}]*)\}/g)].map(
      ([, name = ""]) => name,
    );
    const used = names.filter((name) => storybookTypeNames.has(name));
    if (used.length > 1) {
      errors.push(
        `the Storybook step "${source}" (${at}) uses ${used.map((name) => `{${name}}`).join(", ")}: a Storybook step uses one of the plugin's parameter types, once (a story, an unmounted story, or a stories file)`,
      );
      continue;
    }
    const unknown = names.filter((name) => !registry.lookupByTypeName(name));
    if (unknown.length > 0) {
      errors.push(
        `the Storybook step "${source}" (${at}) uses ${unknown.map((name) => `{${name}}`).join(", ")}: a Storybook step may use only the plugin's parameter types and cucumber's built-in ones ({word}, {string}, {int}, …)`,
      );
      continue;
    }
    expressions.push({
      at,
      expression: new CucumberExpression(source, registry),
    });
  }
  return {
    used: scans.some((scan) => scan.length > 0),
    /** Every Storybook step's expression as written, in order: what links are made from. */
    expressions: scans
      .flat()
      .map(({ source, unreadable }) => source ?? unreadable ?? ""),
    errors,
    /** The Storybook steps `text` matches, each with what it links. */
    match: (text: string): StepLink[] =>
      expressions.flatMap(({ at, expression }) => {
        const args = expression.match(text);
        if (!args) {
          return [];
        }
        const argOf = (name: string) =>
          args.find((arg) => arg.parameterType.name === name)?.group.value;
        const rendered = argOf(storybookParameterTypes.story.name);
        const unmounted = argOf(storybookParameterTypes.storyUnmounted.name);
        const storiesFile = argOf(storybookParameterTypes.storiesFile.name);
        const exportName = unmounted ?? rendered;
        return [
          {
            at,
            unmounted: unmounted !== undefined,
            ...(exportName !== undefined && { exportName }),
            ...(storiesFile !== undefined && { storiesFile }),
          },
        ];
      }),
  };
};

/** The Storybook steps of the support files' scans (see `storybookStepsOf`). */
export type StorybookSteps = ReturnType<typeof storybookStepsOf>;
