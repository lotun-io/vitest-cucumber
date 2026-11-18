// Storybook's addon in a Vitest project: its Vite plugin's name marks a Storybook project (its
// story tests: `../../storybookPlugin.ts`), which a hook knows by its environment
// (`this.environment`'s top-level config, checked once per environment).

/** The addon's plugin, which marks a Storybook project. */
const addonPlugin = "vite-plugin-storybook-test";

/**
 * Whether `plugins` (a project's, or an environment's top-level config's) has Storybook's Vitest
 * plugin, the addon's (`storybookTest()`).
 */
export const hasStorybookPlugin = (plugins: readonly { name: string }[]) =>
  plugins.some(({ name }) => name === addonPlugin);

/** An environment, as a hook's `this.environment` has it: its top-level config's plugins. */
export interface Environment {
  getTopLevelConfig(): { plugins: readonly { name: string }[] };
}

/** Whether each environment is a Storybook project's (its top-level config has the addon's plugin). */
const storybookEnvironments = new WeakMap<Environment, boolean>();

/** Whether `environment` is a Storybook project's (checked once). */
export const inStorybook = (environment: Environment) => {
  let inIt = storybookEnvironments.get(environment);
  if (inIt === undefined) {
    inIt = hasStorybookPlugin(environment.getTopLevelConfig().plugins);
    storybookEnvironments.set(environment, inIt);
  }
  return inIt;
};
