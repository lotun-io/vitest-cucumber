# @lotun/vitest-cucumber

## 0.4.4

### Patch Changes

- d7fcc9c: Replace glob with tinyglobby in node support loading
- d7fcc9c: Browser mode multi-project isolation

## 0.4.3

### Patch Changes

- 4346b26: Simplify browser node bridge
- 6746574: Replace Vitest private onCleanup with public alternative

## 0.4.2

### Patch Changes

- decef0a: Improve Cucumber config parsing - config files, named profiles
- 3b0d33d: Support for Cucumber publish option

## 0.4.1

### Patch Changes

- 2a5d460: Cucumber attachments now surface as Vitest test annotations

## 0.4.0

### Minor Changes

- 0fa659b: Add Vitest browser mode support — step and hook bodies now run in the browser, with @cucumber/cucumber importable there.

## 0.3.0

### Minor Changes

- 282c3ed: BeforeAll / AfterAll hooks now run once per worker instead of once per feature file

## 0.2.10

### Patch Changes

- a9c10ea: Prevent silent skip when a feature file errors with no runnable tests

## 0.2.9

### Patch Changes

- c29e383: Update cucumber dependencies

## 0.2.8

### Patch Changes

- 21d03f3: Skip test when all scenarios are filtered out

## 0.2.7

### Patch Changes

- 237dac0: Enhance status fallback

## 0.2.6

### Patch Changes

- d598613: Enhance error stack frames

## 0.2.5

### Patch Changes

- dee7ff3: Add support for @cucumber/cucumber v13.x

## 0.2.4

### Patch Changes

- 74bc9e2: remove @cucumber/gherkin from deps

## 0.2.3

### Patch Changes

- d97d372: Add support for running specific feature files and scenarios

## 0.2.2

### Patch Changes

- 5083ca0: Improve status handling

## 0.2.1

### Patch Changes

- 4683257: Scenarios with no steps are now skipped instead of hanging the test suite.

## 0.2.0

### Minor Changes

- 59f2ca1: Vitest test order now matches Cucumber's execution order

## 0.1.10

### Patch Changes

- a6f1ee7: Retry support - scenarios retried via Cucumber's retry option now correctly report the final attempt's result.

## 0.1.9

### Patch Changes

- 06409bd: Scenarios now run as concurrent Vitest tests, streaming results in real-time as each scenario completes.

## 0.1.8

### Patch Changes

- 26d8dff: Fix double diff output in createError

## 0.1.7

### Patch Changes

- 8af28aa: Enhance error handling

## 0.1.6

### Patch Changes

- c0fa71e: Enhance README with examples

## 0.1.5

### Patch Changes

- 2542b1f: Add readme to package.json files

## 0.1.4

### Patch Changes

- 1d624e2: Add example folder

## 0.1.3

### Patch Changes

- f04ebba: Update package exports

## 0.1.2

### Patch Changes

- 0990f52: Update readme

## 0.1.1

### Patch Changes

- 27ebc2e: Initial release
