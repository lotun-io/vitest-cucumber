---
"@lotun/vitest-cucumber": patch
---

Storybook: a docs page attached to a feature file that can't be used (`<Meta of={…}>` on a feature that doesn't parse or whose stories can't be linked) no longer stops every story test at startup with Storybook's "Could not find or load CSF file". The feature's own story tests fail with its error, and the others run.
