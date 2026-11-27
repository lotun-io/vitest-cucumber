---
"@lotun/vitest-cucumber": patch
---

Storybook: a feature names its stories file in its Background (`Given the stories of "./Button.stories.ts"`), and every scenario names its story (`Given the "Primary" story`, `"default"` for the meta). The stories file next to a feature is no longer taken, and a scenario without a story step no longer runs on the meta: a feature or scenario without them fails with an error saying what to add. The Storybook steps' placeholders now match as cucumber's `{string}`: write their values in quotes. The plugin no longer defines parameter types, which made a regular expression step with a `(\w+)` group fail in Storybook (ambiguous parameter types)
