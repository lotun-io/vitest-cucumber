---
"@lotun/vitest-cucumber": patch
---

Node mode loads Cucumber's own code only when your support code reads one of the exports only it has (a formatter class, `supportCodeLibraryBuilder`, …): about 40 ms and 23 MB less per worker, which with Vitest's default `isolate` is per feature file.
