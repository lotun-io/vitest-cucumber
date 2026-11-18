// The code of a function that imports the support files, in order (the definitions' order): a
// feature module's (`../feature/featureModule.ts`), a Storybook feature module's
// (`../storybook/stories/featureRuntimeModule.ts`), the preview's support module's (`../storybook/preset/supportModule.ts`).
// Imported from the module itself, so Vite reruns it when one changes.

/** An async arrow function importing `files` (absolute paths), one after the other. */
export const importSupportCode = (files: readonly string[]) =>
  [
    "async () => {",
    ...files.map((file) => `  await import(${JSON.stringify(file)});`),
    "}",
  ].join("\n");
