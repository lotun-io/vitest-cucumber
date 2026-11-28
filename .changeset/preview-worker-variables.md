---
"@lotun/vitest-cucumber": patch
---

Storybook: cucumber's worker variables (`CUCUMBER_WORKER_ID`, `CUCUMBER_TOTAL_WORKERS`, `CUCUMBER_PARALLEL`) are set in Storybook's own preview too (`storybook dev`, a static build), on `import.meta.env`, as one worker of one. They were undefined there; story tests already had them.
