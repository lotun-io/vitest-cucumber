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
// `defineStep(`, with TypeScript's type arguments or not: `Given<StoryWorld>(`), so it's found in
// each support file's syntax tree (`oxc-parser`, Vite 8's parser: TypeScript and JSX by the file's
// extension; a comment is no code, an old copy commented out no step cucumber defines; a file it
// can't parse is the features' error), its value is the literal's, and it's compiled as
// Storybook's hosts define it (its
// placeholder `{string}`) with cucumber's built-in parameter types, matching a step's text exactly
// as cucumber will. A Storybook step has one of the plugin's placeholders, once; another parameter
// type in it (the user's own) is an error: main doesn't know its pattern.
import {
  CucumberExpression,
  ParameterTypeRegistry,
} from "@cucumber/cucumber-expressions";
import {
  type BindingPattern,
  type CallExpression,
  type ModuleExportName,
  parseSync,
  type PropertyKey,
  Visitor,
} from "oxc-parser";
import type { Located } from "../../../utils/errors.ts";
import {
  storybookExpressionOf,
  storybookPlaceholders,
} from "../../../utils/storybookPlaceholders.ts";

/** Where something is: `file:line`. */
type At = string;

/**
 * A Storybook step's expression, as found in a support file: its value, or its text if it can't be
 * read; or why the file can't be parsed (`at`: where).
 */
interface FoundExpression {
  at: At;
  source?: string;
  unreadable?: string;
  unparsable?: string;
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

/** The names a step is defined with. */
const definitions = new Set(["Given", "When", "Then", "defineStep"]);

/** One of the plugin's placeholders, in a literal's text. */
const placeholder = new RegExp(
  String.raw`\{(?:${Object.values(storybookPlaceholders).join("|")})\}`,
);

/** An imported or destructured name, as written: `Given` in `{ Given as Step }`, `{ Given: Step }`. */
const keyName = (key: ModuleExportName | PropertyKey) =>
  key.type === "Identifier"
    ? key.name
    : key.type === "Literal" && typeof key.value === "string"
      ? key.value
      : undefined;

/** The local name a binding gives (`Step` in `{ Given: Step }`, with a default value too). */
const localName = (pattern: BindingPattern) => {
  const target = pattern.type === "AssignmentPattern" ? pattern.left : pattern;
  return target.type === "Identifier" ? target.name : undefined;
};

/**
 * A Storybook step's expression in call `call`, if it's a step definition's (`Given(`, a local
 * name of one in `names`, also as `cucumber.Given(`) whose first argument is a string or a
 * template literal with one of the plugin's placeholders: its value, or its text if it has a
 * substitution (`${`).
 */
const expressionOf = (
  call: CallExpression,
  code: string,
  names: Set<string>,
) => {
  const { callee } = call;
  const member = callee.type === "MemberExpression" && !callee.computed;
  const name =
    callee.type === "MemberExpression" && !callee.computed
      ? callee.property
      : callee;
  const [literal] = call.arguments;
  if (
    name.type !== "Identifier" ||
    !(member ? definitions : names).has(name.name) ||
    (literal?.type !== "Literal" && literal?.type !== "TemplateLiteral")
  ) {
    return undefined;
  }
  const text = code.slice(literal.start, literal.end);
  if (!placeholder.test(text)) {
    return undefined;
  }
  if (literal.type === "Literal") {
    return typeof literal.value === "string"
      ? { start: name.start, source: literal.value }
      : undefined;
  }
  const [only] = literal.quasis;
  return literal.expressions.length === 0 &&
    typeof only?.value.cooked === "string"
    ? { start: name.start, source: only.value.cooked }
    : { start: name.start, unreadable: text };
};

/**
 * The Storybook steps' expressions in support file `file` (its path from the project's root: each
 * place's; its `code`), each at its definition's line; a file that can't be parsed: its first error alone. A definition is called by its name, or
 * by the one the file gives it as it imports or destructures it, from any module (`import { Given
 * as Step }`, `const { Given: Step } = require(…)`): the file's names, its scopes aside.
 */
export const scanSupportCode = (code: string, file: string) => {
  const lineOf = (offset: number) =>
    `${file}:${String(code.slice(0, offset).split("\n").length)}`;
  const { program, errors } = parseSync(file, code);
  const [error] = errors;
  if (error) {
    return [
      {
        at: lineOf(error.labels[0]?.start ?? 0),
        unparsable: error.message,
      },
    ] satisfies FoundExpression[];
  }
  const names = new Set(definitions);
  /** A local name for a definition: kept as the file names it. */
  const alias = (imported: string | undefined, local: string | undefined) => {
    if (imported !== undefined && definitions.has(imported) && local) {
      names.add(local);
    }
  };
  const calls: CallExpression[] = [];
  new Visitor({
    CallExpression(call) {
      calls.push(call);
    },
    ImportSpecifier({ imported, local }) {
      alias(keyName(imported), local.name);
    },
    ObjectPattern({ properties }) {
      for (const property of properties) {
        if (property.type === "Property" && !property.computed) {
          alias(keyName(property.key), localName(property.value));
        }
      }
    },
  }).visit(program);
  return calls.flatMap((call): FoundExpression[] => {
    const expression = expressionOf(call, code, names);
    if (!expression) {
      return [];
    }
    const { start, ...value } = expression;
    return [{ at: lineOf(start), ...value }];
  });
};

/**
 * Why cucumber refuses an expression: its error's reason, the line after its pointer (`^`); the
 * rest quotes the expression as Storybook's hosts define it (`{string}`), not as written.
 */
const reasonOf = (error: unknown) => {
  const lines = (error instanceof Error ? error.message : String(error)).split(
    "\n",
  );
  const pointer = lines.findIndex((line) => /^\s*\^/.test(line));
  return lines[pointer + 1] ?? lines[0] ?? "";
};

/** The expressions of one support file's scan. */
type Scan = ReturnType<typeof scanSupportCode>;

/**
 * The Storybook steps of the support files' `scans`: `expressions` each one's
 * as written (watch mode: every feature links again when they're others), `match` gives each
 * Storybook step a step's `text` matches (two or more: ambiguous), and `errors` the support files
 * that can't be parsed and the expressions that can't be compiled as cucumber would (one that
 * can't be read, or uses a parameter type other than cucumber's built-in ones).
 */
export const storybookStepsOf = (scans: Scan[]) => {
  const registry = new ParameterTypeRegistry();
  const errors: Located[] = [];
  /** Each Storybook step: its expression as Storybook's hosts define it, its placeholder's kind and place among its parameters. */
  const expressions: {
    at: At;
    expression: CucumberExpression;
    kind: keyof typeof storybookPlaceholders;
    index: number;
  }[] = [];
  for (const { at, source, unreadable, unparsable } of scans.flat()) {
    if (unparsable !== undefined) {
      errors.push({
        message: `the support file can't be parsed (${unparsable})`,
        at: [at],
      });
      continue;
    }
    if (source === undefined) {
      errors.push({
        message: `the Storybook step ${unreadable ?? ""} can't be read, write its expression as a plain string`,
        at: [at],
      });
      continue;
    }
    const names = [...source.matchAll(/\{([^{}]*)\}/g)].map(
      ([, name = ""]) => name,
    );
    const used = names.filter((name) => kinds.has(name));
    if (used.length > 1) {
      errors.push({
        message: `the Storybook step "${source}" has ${String(used.length)} placeholders (${used.map((name) => `{${name}}`).join(", ")}), keep one`,
        at: [at],
      });
      continue;
    }
    const unknown = names.filter(
      (name) => !kinds.has(name) && !registry.lookupByTypeName(name),
    );
    if (unknown.length > 0) {
      errors.push({
        message: `the Storybook step "${source}" uses ${unknown.map((name) => `{${name}}`).join(", ")}, a Storybook step can only use cucumber's built-in parameter types beside its placeholder ({string}, {int}, {word}, …)`,
        at: [at],
      });
      continue;
    }
    const index = names.findIndex((name) => kinds.has(name));
    let expression;
    try {
      expression = new CucumberExpression(
        storybookExpressionOf(source),
        registry,
      );
    } catch (error) {
      errors.push({
        message: `the Storybook step "${source}" isn't a valid cucumber expression (${reasonOf(error)})`,
        at: [at],
      });
      continue;
    }
    expressions.push({
      at,
      expression,
      kind: kinds.get(names[index] ?? "") ?? "story",
      index,
    });
  }
  return {
    /** Every Storybook step's expression as written, in order: what links are made from. */
    expressions: scans
      .flat()
      .map(
        ({ source, unreadable, unparsable }) =>
          source ?? unreadable ?? unparsable ?? "",
      ),
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
