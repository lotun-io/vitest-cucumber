// What a page loads of the plugin's (browser mode's, Storybook's story tests' and its preview's): its
// `@cucumber/cucumber`, the packages its runtime imports (pre-bundled), and the plugin itself never
// pre-bundled. Its own module: what a page gets, apart from how a plugin serves it.
import { ownModule } from "../utils/ownModule.ts";

/** What the page gets for `@cucumber/cucumber`, and for its subpaths (a module that throws). */
const pageCucumber = ownModule("worker/cucumber/page");
const pageCucumberApi = ownModule("worker/cucumber/pageApi");

/**
 * A page's `@cucumber/cucumber` (browser mode's, Storybook's preview's): the plugin's stand-in, and
 * its subpaths (the API, `lib/…`) a module that throws: the page has no cucumber runner of
 * cucumber's (it runs the plugin's own runtime, `../../worker/runner/`).
 */
export const resolvePageCucumber = (source: string) =>
  source === "@cucumber/cucumber"
    ? pageCucumber
    : source.startsWith("@cucumber/cucumber/")
      ? pageCucumberApi
      : undefined;

/**
 * What is never pre-bundled. The plugin itself: the page loads its modules by path (the runtime,
 * the stand-in), and a pre-bundled copy of an entry the support code imports by name
 * (`@lotun/vitest-cucumber/storybook`) would be a second copy of their state (the running story).
 * And cucumber: Vite leaves what is excluded an import in every other package's pre-bundle, so a
 * package of steps the support code imports (pre-bundled, as any package) imports cucumber as a
 * support file does, and gets the page's (`resolvePageCucumber`: the plugin's hooks aren't asked
 * inside a pre-bundle). Pre-bundled with it, the package would be cucumber's own code, which is
 * Node's: the page fails as it loads.
 */
export const pageExcluded = ["@lotun/vitest-cucumber", "@cucumber/cucumber"];

/** The packages every page's runtime imports, pre-bundled (Storybook's preview's too). */
export const runtimeDependencies = [
  "@lotun/vitest-cucumber > @cucumber/core",
  "@lotun/vitest-cucumber > @cucumber/cucumber-expressions",
  "@lotun/vitest-cucumber > @cucumber/messages",
  "@lotun/vitest-cucumber > @cucumber/tag-expressions",
  // The support code's message ids (`../../worker/runner/supportIds.ts`).
  "@lotun/vitest-cucumber > uuid",
  // A thrown value that isn't an error, as its text (`../../worker/runner/userCode.ts`).
  "@lotun/vitest-cucumber > @vitest/utils/display",
];

/** A Vitest page's packages, pre-bundled: the runtime's, and Vitest's error serialization. */
export const pageDependencies = [
  ...runtimeDependencies,
  // A page's errors serialized as Vitest sends a test's, their BigInts as text
  // (`../../worker/platform/errors/serializedErrors.ts`, `../../worker/platform/errors/bigIntsAsText.ts`).
  "@lotun/vitest-cucumber > @vitest/utils/serialize",
];
