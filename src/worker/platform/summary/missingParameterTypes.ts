// The run's missing parameter types a scenario could use. Cucumber drops a step definition whose
// expression names a type nobody defined, and its `undefinedParameterType` message keeps only the
// expression and the first missing name: nothing ties it to a step. So a scenario's summary lists
// those whose expression matches one of its undefined steps' texts, built with the run's parameter
// types (their `parameterType` messages; the built-in ones are the registry's own) and each missing
// one matching anything, since its pattern doesn't exist yet. Page-safe.
import {
  CucumberExpression,
  ParameterType,
  ParameterTypeRegistry,
} from "@cucumber/cucumber-expressions";
import type { UndefinedParameterType } from "@cucumber/messages";
import type { Query } from "../../../types/query.ts";

/** A parameter type for matching only: its value is the text it matched. */
const typeOf = (
  name: string,
  regularExpressions: readonly string[],
  useForSnippets = false,
  preferForRegexpMatch = false,
) =>
  new ParameterType(
    name,
    regularExpressions,
    null,
    (value: string) => value,
    useForSnippets,
    preferForRegexpMatch,
  );

/** Of a scenario's run's missing parameter types (`missing`), those one of its undefined steps could use. */
export const usedMissingTypes = (
  query: Query,
  missing: readonly UndefinedParameterType[],
) => {
  const texts = query.undefinedStepTexts();
  const registry = new ParameterTypeRegistry();
  for (const parameterType of query.parameterTypes()) {
    registry.defineParameterType(
      typeOf(
        parameterType.name,
        parameterType.regularExpressions,
        parameterType.useForSnippets,
        parameterType.preferForRegularExpressionMatch,
      ),
    );
  }
  const couldMatch = (expression: string) => {
    // As cucumber builds a definition, which stops at the first missing type: each one gets a
    // stand-in until it builds.
    for (;;) {
      try {
        const built = new CucumberExpression(expression, registry);
        return texts.some((text) => built.match(text) !== null);
      } catch (error) {
        const name =
          typeof error === "object" &&
          error !== null &&
          "undefinedParameterTypeName" in error
            ? error.undefinedParameterTypeName
            : undefined;
        if (typeof name !== "string") {
          // Not a missing type: can't tell, so it's listed.
          return true;
        }
        try {
          registry.defineParameterType(typeOf(name, [".*"]));
        } catch {
          // A name no parameter type may have (`{order.id}`: cucumber's expressions read it as a
          // missing type, its parameter types refuse it): no stand-in, can't tell, so it's
          // listed, as cucumber lists every missing type.
          return true;
        }
      }
    }
  };
  return missing.filter(({ expression }) => couldMatch(expression));
};
