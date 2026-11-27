// The Storybook steps a scenario's feature files use (`Given the stories of "./a.stories.tsx"`,
// `And the "default" story`: each feature's Background, in every mode, so its text and lines are
// the same in each), defined for it when it doesn't define them itself, as the run's mode has them: a
// Storybook project's with the plugin's placeholders, node and browser mode's with cucumber's own
// `{string}` (the plugin's placeholders are Storybook's only). As the scenario's own file
// (`features/storybookSteps.ts`, the support code's glob's: a kept Vitest gets it too). Each does
// nothing.
import { glob } from "tinyglobby";
import type { E2EWorld } from "./world.ts";

/** The file's name in the scenario's project. */
const stepsFile = "features/storybookSteps.ts";

/** The steps file, as `mode` defines the steps. */
const stepsOf = (storybook: boolean) => {
  const [file, story] = storybook
    ? ["{storybook:storiesFile}", "{storybook:story}"]
    : ["{string}", "{string}"];
  return [
    `import { Given } from "@cucumber/cucumber";`,
    "",
    `Given("the stories of ${file}", (_file: string) => undefined);`,
    `Given("the ${story} story", (_story: string) => undefined);`,
    "",
  ].join("\n");
};

/**
 * Writes the Storybook steps' definitions, as the run's mode has them, if the scenario's feature
 * files name a stories file (`the stories of`) and its own support code doesn't define them.
 */
export async function storybookStepsFile(this: E2EWorld) {
  const features = await glob("**/*.{feature,feature.md}", {
    cwd: this.dir,
    ignore: ["node_modules/**"],
  });
  const named = [...this.files].some(
    ([name, content]) =>
      features.includes(name) && content.includes("the stories of "),
  );
  const own = [...this.files].some(
    ([name, content]) =>
      name !== stepsFile &&
      /\.[cm]?[jt]sx?$/.test(name) &&
      /\{storybook:|the \{string\} story/.test(content),
  );
  if (named && !own) {
    await this.write(stepsFile, stepsOf(this.mode === "storybook"));
  }
}
