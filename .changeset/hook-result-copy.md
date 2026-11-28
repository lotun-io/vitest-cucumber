---
"@lotun/vitest-cucumber": patch
---

An `After` or `AfterStep` hook's `result` is a copy of its own: writing to it no longer changes a scenario's outcome (Cucumber hands over the recorded result, and its maintainers don't support changing it: cucumber-js#1724). An `After` hook that marked a passing scenario `FAILED` used to fail it with the plugin's internal error; now nothing changes. Share what a later hook needs through the World.
