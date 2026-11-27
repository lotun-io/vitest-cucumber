// The Storybook steps: the feature's stories file (in its Background), and each scenario's story
// (rendered before its steps, or unmounted: a step mounts it), each in quotes in the feature. Their
// code does nothing: the plugin reads their expressions, with its placeholders, to link each
// scenario to its story before anything runs.
import { Given } from "@cucumber/cucumber";

Given("the stories of {storybook:storiesFile}", (_file: string) => {});
Given("the {storybook:story} story", (_story: string) => {});
Given("the unmounted {storybook:storyUnmounted} story", (_story: string) => {});
