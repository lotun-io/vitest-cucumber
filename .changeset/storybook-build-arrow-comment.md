---
"@lotun/vitest-cucumber": patch
---

Storybook: `storybook build` no longer breaks a JavaScript step or hook with a comment holding `=>` between its parameters and its arrow (`(world /* => */) => …`). The statement the build writes into a World-taking arrow function went inside the comment, and the module no longer parsed.
