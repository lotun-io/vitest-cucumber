// `@lotun/vitest-cucumber/storybook/node`: what `.storybook/main.ts` uses, in Node (Storybook's own
// process, and the addon's Vitest as it loads the presets): `cucumber({ … })`, the plugin as an
// addon with its options (`./addon.ts`). Apart from `@lotun/vitest-cucumber/storybook`, which
// is the page's (steps, docs blocks): `main.ts` loads none of the page's modules. Storybook's own
// layout: a framework's `defineMain` is its `/node` too.
// With its types a project gets cucumber's hooks typed for the World as a first argument.
// eslint-disable-next-line @typescript-eslint/triple-slash-reference -- an ambient declaration: no import brings one in
/// <reference path="../../types/cucumber.d.mts" preserve="true" />
export type { CucumberOptions } from "../../types/feature.ts";
export { cucumber } from "./addon.ts";
