---
"@lotun/vitest-cucumber": patch
---

Error messages about your files have one shape: what's wrong, then each place it's about on a line of its own, from the project's root, like a stack trace. A feature file that can't be parsed lists each parse error with its `path:line:column`, a Storybook feature that can't be linked lists each problem with its places (a step matching two Storybook steps names both definitions and the step), and no message has an absolute path any more. A Storybook step whose expression cucumber refuses says so with cucumber's reason and its place, and a Storybook feature without scenarios says it has none (it was told it names no stories file).
