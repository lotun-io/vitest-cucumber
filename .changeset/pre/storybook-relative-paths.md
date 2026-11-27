---
"@lotun/vitest-cucumber": patch
---

Storybook: a stories file outside Storybook's folder (`../shared/Card.stories.tsx`, in a monorepo) has its features in `featuresOf`, and one in a folder named with a dot (`.design/`) loads its feature files' stories: the plugin wrote their paths otherwise than Storybook does
