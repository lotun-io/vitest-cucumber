---
"@lotun/vitest-cucumber": patch
---

A setup file's fake timers (`vi.useFakeTimers()` in `setupFiles`) no longer stop a step's or hook's timeout, which made the run hang, nor change a result's duration or a message's timestamp: the plugin's own setup file, first in every project's `setupFiles`, saves the real timers and clock before the project's setup files run.
