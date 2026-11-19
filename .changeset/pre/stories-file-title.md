---
"@lotun/vitest-cucumber": patch
---

Storybook: a feature is listed under its stories file's title also when the stories file writes none (Storybook's automatic title)

- Fixes "Duplicate stories with id" for a scenario named like one of its stories file's stories.
- A feature in another folder is listed under its stories file, not under its own path.
- Story tests show their status in Storybook's UI for these features too.
- A stories file with no written `title` that no `stories` pattern matches is the feature's link error.
