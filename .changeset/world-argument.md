---
"@lotun/vitest-cucumber": patch
---

An arrow function can take the World as an argument: a step or hook whose first parameter is named `world` gets the World there, before Cucumber's own arguments (`Given("a cart with {string}", (world: CartWorld, item: string) => …)`, `Before((world: CartWorld, { pickle }) => …)`); a `BeforeAll` or `AfterAll` hook whose first parameter is named `context` gets its context. The plugin's types type Cucumber's hooks for it (`"types": ["@lotun/vitest-cucumber"]` in a `tsconfig.json` that doesn't check the Vitest config). An arrow step whose first parameter was already named `world` for something else needs another name
