---
"@lotun/vitest-cucumber": patch
---

Storybook: two scenarios of a feature that would get one story id (the same name, names differing only in case or punctuation, an Outline's rows its name doesn't tell apart, two features on one stories file whose names differ only so) now fail the feature with an error naming each and the id, where the second was numbered or Storybook silently kept one. A story's id now has its Rule's name before its own, so one name in two Rules is two stories. A scenario named with characters a JavaScript name can't have (`²`, `①`) no longer breaks its feature's module.
