---
"@lotun/vitest-cucumber": patch
---

Windows: an `import` glob with `\` (one made with `path.join`, `path.resolve` or `fileURLToPath` in the config) loads its support code, as cucumber reads it there. It matched nothing, so every step was undefined
