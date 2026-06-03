import { Before, After, BeforeAll, AfterAll } from "@cucumber/cucumber";

Before({ tags: "@skip" }, function before() {
  return "skipped";
});

Before({ tags: "@failBefore" }, function failBefore() {
  throw new Error("Before hook failed intentionally");
});

After({ tags: "@failAfter" }, function failAfter() {
  throw new Error("After hook failed intentionally");
});

BeforeAll(function beforeAll() {
  if (process.env.FAIL_BEFORE_ALL) {
    throw new Error("BeforeAll hook failed intentionally");
  }
});

AfterAll(function afterAll2() {
  if (process.env.FAIL_AFTER_ALL) {
    throw new Error("AfterAll hook failed intentionally");
  }
});
