---
"@lotun/vitest-cucumber": patch
---

Storybook: a Storybook step defined with TypeScript's type arguments (`Given<StoryWorld>("the {storybook:story} story", …)`) is found. It wasn't, and every scenario then failed with "names no story".
