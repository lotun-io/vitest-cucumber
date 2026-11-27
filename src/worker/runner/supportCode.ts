// The support code, as cucumber's composition library (`@cucumber/core`) builds it from the calls
// the support code made to the plugin's `@cucumber/cucumber` stand-in, read as
// cucumber 13.3.0's builder reads them (`lib/support_code_library_builder/index.ts`), with its
// validation (`./validateArguments.ts`). Steps, `Before`/`After`, `BeforeAll`/`AfterAll` and parameter
// types go to core's builder. What core doesn't have stays here, for the runtime (`./runner.ts`,
// `./testCaseRunner.ts`): `BeforeStep` and `AfterStep`, each definition's timeout and wrapper options,
// the definition function wrapper (applied to every definition, as cucumber does), whether its code
// takes the World as its first argument (`./thisFirst.ts`: read from the code as written, before
// its wrapper) and the World class
// (the default timeout is the host's: `setDefaultTimeout` isn't supported, refused here with
// `setParallelCanAssign`). Each
// call's location comes from its recorded stack, source-mapped (browser mode: by main).
import { buildSupportCode as buildCoreSupportCode } from "@cucumber/core";
import type { IdGenerator, SourceReference } from "@cucumber/messages";
import { parse } from "@cucumber/tag-expressions";
import type { RuntimeEnvironment } from "../../types/runtimeEnvironment.ts";
import type {
  Code,
  Definition,
  StepHook,
  SupportCall,
  SupportCode,
  WorldConstructor,
} from "../../types/supportCode.ts";
import { locatedError, pluginError } from "../../utils/errors.ts";
import { createQuery } from "./query.ts";
import { takesFirst } from "./thisFirst.ts";
import { validateArguments } from "./validateArguments.ts";

type Options = Record<string, unknown>;

const stepMethods = new Set(["Given", "When", "Then", "defineStep"]);

/**
 * Cucumber's support code methods the plugin doesn't support, recorded as the others are (so the
 * error has the call's location, in every mode), each with what to use instead.
 */
const unsupportedMethods = new Map([
  [
    "setDefaultTimeout",
    "Vitest's testTimeout and hookTimeout are the default timeouts",
  ],
  ["setParallelCanAssign", "Vitest assigns the feature files to its workers"],
]);

/**
 * Builds the support code from `calls`, in order. `wrapper` is `setDefinitionFunctionWrapper`'s
 * function, if any; `parameterTypes` the host's own, defined first. Throws cucumber's error for a
 * call it refuses.
 */
export const buildSupportCode = (
  calls: readonly SupportCall[],
  {
    newId,
    wrapper,
    parameterTypes = [],
  }: {
    newId: IdGenerator.NewId;
    wrapper?: (code: Code, wrapperOptions: unknown) => Code;
    /** The host's own parameter types (`RuntimeEnvironment["parameterTypes"]`). */
    parameterTypes?: RuntimeEnvironment["parameterTypes"];
  },
): SupportCode => {
  const builder = buildCoreSupportCode({ newId });
  const definitions = new Map<unknown, Definition>();
  const beforeStepHooks: StepHook[] = [];
  const afterStepHooks: StepHook[] = [];
  let World: WorldConstructor | undefined;

  /** Cucumber's `wrapCode`: the wrapper's code, with the original's length. */
  const wrap = (code: Code, wrapperOptions?: unknown): Code => {
    if (!wrapper) {
      return code;
    }
    const wrapped = wrapper(code, wrapperOptions);
    if (wrapped !== code) {
      Object.defineProperty(wrapped, "length", { value: code.length });
    }
    return wrapped;
  };

  /** A function of the definition's own, which core keeps as its `fn`, with the code's length. */
  const handleOf = (definition: Definition): Code => {
    const handle = function (this: unknown, ...args: unknown[]) {
      return definition.code.apply(this, args);
    };
    Object.defineProperty(handle, "length", { value: definition.code.length });
    definitions.set(handle, definition);
    return handle;
  };

  // The host's own parameter types (a Storybook host's: the Storybook steps'), before the support
  // code's: the plugin's, so no source of their own; one the support code defined itself is its own.
  const defined = new Set(
    calls.flatMap(({ method, args: [options] }) =>
      method === "defineParameterType"
        ? [(options as Options | undefined)?.name]
        : [],
    ),
  );
  for (const { name, regexp } of parameterTypes) {
    if (!defined.has(name)) {
      builder.parameterType({
        name,
        regexp,
        // The step gets the text; never in a snippet (any word matches).
        transformer: (text: string) => text,
        useForSnippets: false,
        preferForRegexpMatch: false,
        sourceReference: {},
      });
    }
  }

  for (const { method, args, location, stack } of calls) {
    try {
      // Its line only, as cucumber writes a definition's (`getDefinitionLineAndUri`).
      const uri = location?.uri ?? "unknown";
      const line = location?.line ?? 0;
      const sourceReference: SourceReference = { uri, location: { line } };
      const where = `${uri}:${String(line)}`;
      const instead = unsupportedMethods.get(method);
      if (instead !== undefined) {
        throw locatedError(`${method} isn't supported, ${instead}`, where);
      }
      /** A hook's `(options, code)`, `(code)` or, with tags, `(tags, code)`, as cucumber reads them. */
      const hookArgs = (withTags: boolean) => {
        let [options, code] = args as [unknown, unknown];
        if (withTags && typeof options === "string") {
          options = { tags: options };
        } else if (typeof options === "function") {
          code = options;
          options = {};
        }
        return { options: options as Options, code: code as Code };
      };

      if (stepMethods.has(method)) {
        const [pattern] = args;
        let [, options, code] = args as [unknown, unknown, unknown];
        if (typeof options === "function") {
          code = options;
          options = {};
        }
        validateArguments({
          args: { code, pattern, options: options as Options },
          fnName: "defineStep",
          method,
          location: where,
        });
        const { timeout, wrapperOptions } = options as Options;
        builder.step({
          pattern: pattern as string | RegExp,
          fn: handleOf({
            code: wrap(code as Code, wrapperOptions),
            timeout: timeout as number | undefined,
            thisFirst: takesFirst(code as Code, "world"),
          }),
          sourceReference,
        });
      } else if (method === "Before" || method === "After") {
        const { options, code } = hookArgs(true);
        validateArguments({
          args: { code, options },
          fnName: "defineTestCaseHook",
          method,
          location: where,
        });
        const hook = {
          fn: handleOf({
            code: wrap(code),
            timeout: options.timeout as number | undefined,
            thisFirst: takesFirst(code, "world"),
          }),
          name: options.name as string | undefined,
          tags: options.tags as string | undefined,
          sourceReference,
        };
        if (method === "Before") {
          builder.beforeHook(hook);
        } else {
          builder.afterHook(hook);
        }
      } else if (method === "BeforeStep" || method === "AfterStep") {
        const { options, code } = hookArgs(true);
        validateArguments({
          args: { code, options },
          fnName: "defineTestStepHook",
          method,
          location: where,
        });
        // `null` and `""` no filter, as cucumber's (`PickleTagFilter`): the validation lets both by.
        const tags: unknown = options.tags;
        (method === "BeforeStep" ? beforeStepHooks : afterStepHooks).push({
          code: wrap(code),
          timeout: options.timeout as number | undefined,
          thisFirst: takesFirst(code, "world"),
          ...(typeof tags === "string" && tags !== "" && { tags: parse(tags) }),
        });
      } else if (method === "BeforeAll" || method === "AfterAll") {
        const { options, code } = hookArgs(false);
        validateArguments({
          args: { code, options },
          fnName: "defineTestRunHook",
          method,
          location: where,
        });
        const hook = {
          fn: handleOf({
            code: wrap(code),
            timeout: options.timeout as number | undefined,
            thisFirst: takesFirst(code, "context"),
          }),
          name: options.name as string | undefined,
          sourceReference,
        };
        if (method === "BeforeAll") {
          builder.beforeAllHook(hook);
        } else {
          builder.afterAllHook(hook);
        }
      } else if (method === "defineParameterType") {
        const {
          name,
          regexp,
          transformer,
          useForSnippets,
          preferForRegexpMatch,
        } = args[0] as Options;
        builder.parameterType({
          name: name as string,
          regexp: regexp as RegExp | string | RegExp[] | string[],
          transformer: transformer as
            ((...match: string[]) => unknown) | undefined,
          // Cucumber's defaults (`build_parameter_type.ts`).
          useForSnippets:
            typeof useForSnippets === "boolean" ? useForSnippets : true,
          preferForRegexpMatch:
            typeof preferForRegexpMatch === "boolean"
              ? preferForRegexpMatch
              : false,
          sourceReference,
        });
      } else if (method === "setWorldConstructor") {
        // The user's class, as cucumber takes it (unchecked).
        World = args[0] as WorldConstructor;
      } else {
        throw pluginError(`no support code method "${method}"`, {
          internal: true,
        });
      }
    } catch (error) {
      // An error at the call, as node mode has it: the call's frames (its first line, the stack's
      // own `Error`, replaced by the error's). Not the plugin's located errors (`locatedError`),
      // which have none: their message says where.
      if (error instanceof Error && error.stack && stack) {
        error.stack = [
          `${error.name}: ${error.message}`,
          ...stack.split("\n").slice(1),
        ].join("\n");
      }
      throw error;
    }
  }

  const library = builder.build();
  return {
    library,
    query: createQuery(library.toEnvelopes()),
    definitionOf: (fn) => {
      const definition = definitions.get(fn);
      if (!definition) {
        throw pluginError("a definition the support code didn't define", {
          internal: true,
        });
      }
      return definition;
    },
    beforeStepHooks,
    afterStepHooks,
    ...(World && { World }),
  };
};
