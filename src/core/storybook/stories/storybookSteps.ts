// Storybook: the steps that link a scenario to a story, found in the support code without running it.
// A user words them in their own step definitions, with the plugin's placeholders
// (`../../../utils/storybookPlaceholders.ts`: `{string}` as cucumber matches it, in Storybook's
// hosts; node and browser mode keep them as written):
//
//   Given("the {storybook:story} story", (_story: string) => {});
//   Given("the unmounted {storybook:storyUnmounted} story", (_story: string) => {});
//   Given("the stories of {storybook:storiesFile}", (_file: string) => {});
//
// Main needs the links before anything runs (Storybook's index, the story tests), and the support
// code runs only in the page. A Storybook step's expression is a string literal with one of the
// plugin's placeholders, the first argument of a step definition (`Given(`, `When(`, `Then(`,
// `defineStep(`), so a regex finds it in each support file (no parser), its value is the literal's
// (evaluated on its own: its escapes), and it's compiled as Storybook's hosts define it (its
// placeholder `{string}`) with cucumber's built-in parameter types, matching a step's text exactly
// as cucumber will. A Storybook step has one of the plugin's placeholders, once; another parameter
// type in it (the user's own) is an error: main doesn't know its pattern.
import {
  CucumberExpression,
  ParameterTypeRegistry,
} from "@cucumber/cucumber-expressions";
import {
  storybookExpressionOf,
  storybookPlaceholders,
} from "../../../utils/storybookPlaceholders.ts";

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

/** A placeholder's kind (`story`, `storyUnmounted`, `storiesFile`), by its name. */
const kinds = new Map<string, keyof typeof storybookPlaceholders>(
  Object.entries(storybookPlaceholders).map(([kind, name]) => [
    name,
    kind as keyof typeof storybookPlaceholders,
  ]),
);

/** The placeholders' names without their namespace (`story`, `storyUnmounted`, `storiesFile`). */
const typeNames = [...kinds.values()];

/**
 * A step definition's expression with one of the plugin's placeholders: `Given(`, `When(`, `Then(` or `defineStep(`
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
 * The Storybook steps of the support files' `scans`: `expressions` each one's
 * as written (watch mode: every feature links again when they're others), `match` gives each
 * Storybook step a step's `text` matches (two or more: ambiguous), and `errors` the expressions
 * that can't be compiled as cucumber would (one that can't be read, or uses a parameter type other
 * than cucumber's built-in ones).
 */
export const storybookStepsOf = (scans: Scan[]) => {
  const registry = new ParameterTypeRegistry();
  const errors: string[] = [];
  /** Each Storybook step: its expression as Storybook's hosts define it, its placeholder's kind and place among its parameters. */
  const expressions: {
    at: At;
    expression: CucumberExpression;
    kind: keyof typeof storybookPlaceholders;
    index: number;
  }[] = [];
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
    const used = names.filter((name) => kinds.has(name));
    if (used.length > 1) {
      errors.push(
        `the Storybook step "${source}" (${at}) uses ${used.map((name) => `{${name}}`).join(", ")}: a Storybook step uses one of the plugin's placeholders, once (a story, an unmounted story, or a stories file)`,
      );
      continue;
    }
    const unknown = names.filter(
      (name) => !kinds.has(name) && !registry.lookupByTypeName(name),
    );
    if (unknown.length > 0) {
      errors.push(
        `the Storybook step "${source}" (${at}) uses ${unknown.map((name) => `{${name}}`).join(", ")}: a Storybook step may use only the plugin's placeholders and cucumber's built-in parameter types ({word}, {string}, {int}, …)`,
      );
      continue;
    }
    const index = names.findIndex((name) => kinds.has(name));
    expressions.push({
      at,
      expression: new CucumberExpression(
        storybookExpressionOf(source),
        registry,
      ),
      kind: kinds.get(names[index] ?? "") ?? "story",
      index,
    });
  }
  return {
    /** Every Storybook step's expression as written, in order: what links are made from. */
    expressions: scans
      .flat()
      .map(({ source, unreadable }) => source ?? unreadable ?? ""),
    errors,
    /** The Storybook steps `text` matches, each with what it links. */
    match: (text: string): StepLink[] =>
      expressions.flatMap(({ at, expression, kind, index }) => {
        const args = expression.match(text);
        if (!args) {
          return [];
        }
        // Its placeholder's value: `{string}`'s, inside the quotes.
        const value = String(args[index]?.getValue(undefined) ?? "");
        return [
          {
            at,
            unmounted: kind === "storyUnmounted",
            ...(kind === "storiesFile"
              ? { storiesFile: value }
              : { exportName: value }),
          },
        ];
      }),
  };
};

/** The Storybook steps of the support files' scans (see `storybookStepsOf`). */
export type StorybookSteps = ReturnType<typeof storybookStepsOf>;
