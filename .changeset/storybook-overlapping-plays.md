---
"@lotun/vitest-cucumber": patch
---

Storybook: a story re-rendered while it plays (a file saved in `storybook dev`) no longer breaks its new play. Storybook starts the new play without reloading the page, and the old one's end cleared the running story: `story()` threw "no story is running" and the new play's steps left the Interactions panel. A page now plays one story at a time, the new play starting once the old one ends.
