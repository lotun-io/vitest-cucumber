---
"@lotun/vitest-cucumber": patch
---

Storybook: a scenario can say where its story is, with Storybook's own tags written as Gherkin tags. `@!test` keeps it in Storybook's sidebar and out of story tests (a skipped test in Vitest); `@!dev` runs it as a story test and keeps it out of the sidebar; `@dev` and `@test` put back what a feature's tag, the story or the stories file's meta took away. In a Storybook project these four are the story's Storybook tags (without the `@`) and no longer its test's Vitest tags
