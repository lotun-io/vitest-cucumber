// The Storybook steps: a scenario's story (rendered before its steps, or unmounted: a step mounts it), or the feature's stories file
// (instead of the one next to it). Their code does nothing: the plugin reads their expressions, with
// its own parameter types (the plugin defines them), to link each scenario to its story
// before anything runs.
import { Given } from "@cucumber/cucumber";

Given("the {storybook:story} story", (_story: string) => {});
Given("the unmounted {storybook:storyUnmounted} story", (_story: string) => {});
Given("the stories of {storybook:storiesFile}", (_file: string) => {});
