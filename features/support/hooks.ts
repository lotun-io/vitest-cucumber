import { Before, After, BeforeAll, AfterAll } from "@cucumber/cucumber";

Before({ tags: "@skip" }, function before() {
  return "pending";
});

Before({ tags: "@failBefore" }, function failBefore() {
  // eslint-disable-next-line config-thefork/throw-thefork-error
  throw new Error("Before hook failed intentionally");
});

After({ tags: "@failAfter" }, function failAfter() {
  // eslint-disable-next-line config-thefork/throw-thefork-error
  throw new Error("After hook failed intentionally");
});

BeforeAll(function beforeAll() {
  // eslint-disable-next-line n/no-process-env
  if (process.env.FAIL_BEFORE_ALL) {
    // eslint-disable-next-line config-thefork/throw-thefork-error
    throw new Error("BeforeAll hook failed intentionally");
  }
});

AfterAll(function afterAll2() {
  // eslint-disable-next-line n/no-process-env
  if (process.env.FAIL_AFTER_ALL) {
    // eslint-disable-next-line config-thefork/throw-thefork-error
    throw new Error("AfterAll hook failed intentionally");
  }
});
